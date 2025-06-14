import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Register the expand-task tool
 * @param {Object} server - FastMCP server instance
 */
export function registerExpandTaskTool(server) {
  server.addTool({
    name: 'expand_task',
    description: 'Expand a task into subtasks using AI guidance. Returns detailed instructions for Claude to execute the task expansion.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskId: z
        .number()
        .describe('Task ID to expand into subtasks'),
      numSubtasks: z
        .number()
        .optional()
        .describe('Optional: Explicit target number of subtasks. If not provided, will use complexity report or config default'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task expansion'),
      additionalContext: z
        .string()
        .optional()
        .default('')
        .describe('Optional additional context for task expansion'),
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, replace existing subtasks; otherwise, append')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskId, numSubtasks, research, additionalContext, force } = args;
        
        logger.info(`Preparing task expansion instructions for task ${taskId}${research ? ' with research mode' : ''}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        // Validate tasks file exists
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found: ${tasksPath}`);
        }
        
        // Read and validate tasks data
        let tasksData;
        try {
          tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
          if (!tasksData || !tasksData.tasks) {
            return createErrorResponse(`Invalid tasks data in ${tasksPath}`);
          }
        } catch (error) {
          return createErrorResponse(`Failed to read tasks file: ${error.message}`);
        }
        
        // Find the task to expand
        const task = tasksData.tasks.find(t => t.id === taskId);
        if (!task) {
          return createErrorResponse(`Task ${taskId} not found`);
        }
        
        // Check for complexity report to determine subtask count and prompt
        let finalSubtaskCount = numSubtasks || 3; // Default fallback
        let complexityReportPath = path.join(projectRoot, '.taskmaster', 'complexity-report.json');
        let taskAnalysis = null;
        let useComplexityPrompt = false;
        
        try {
          if (fs.existsSync(complexityReportPath)) {
            const complexityReport = JSON.parse(fs.readFileSync(complexityReportPath, 'utf8'));
            taskAnalysis = complexityReport?.complexityAnalysis?.find(a => a.taskId === task.id);
            if (taskAnalysis) {
              if (!numSubtasks && taskAnalysis.recommendedSubtasks) {
                finalSubtaskCount = parseInt(taskAnalysis.recommendedSubtasks, 10);
              }
              if (taskAnalysis.expansionPrompt) {
                useComplexityPrompt = true;
              }
            }
          }
        } catch (reportError) {
          logger.warn(`Could not read complexity report: ${reportError.message}`);
        }
        
        // Determine next subtask ID
        const nextSubtaskId = (task.subtasks?.length || 0) + 1;
        
        let systemPrompt, userPrompt;
        
        if (useComplexityPrompt && taskAnalysis.expansionPrompt) {
          // Use simplified system prompt for complexity report prompts
          systemPrompt = `You are an AI assistant helping with task breakdown. Generate exactly ${finalSubtaskCount} subtasks based on the provided prompt and context. Respond ONLY with a valid JSON object containing a single key "subtasks" whose value is an array of the generated subtask objects. Each subtask object in the array must have keys: "id", "title", "description", "dependencies", "details", "status". Ensure the 'id' starts from ${nextSubtaskId} and is sequential. Ensure 'dependencies' only reference valid prior subtask IDs generated in this response (starting from ${nextSubtaskId}). Ensure 'status' is 'pending'. Do not include any other text or explanation.`;
          
          userPrompt = taskAnalysis.expansionPrompt + (additionalContext ? `\n\n${additionalContext}` : '');
        } else {
          // Use standard system prompt
          systemPrompt = `You are an AI assistant helping with task breakdown for software development.
You need to break down a high-level task into ${finalSubtaskCount} specific subtasks that can be implemented one by one.

Subtasks should:
1. Be specific and actionable implementation steps
2. Follow a logical sequence
3. Each handle a distinct part of the parent task
4. Include clear guidance on implementation approach
5. Have appropriate dependency chains between subtasks (using the new sequential IDs)
6. Collectively cover all aspects of the parent task

For each subtask, provide:
- id: Sequential integer starting from the provided nextSubtaskId
- title: Clear, specific title
- description: Detailed description
- dependencies: Array of prerequisite subtask IDs (use the new sequential IDs)
- details: Implementation details
- testStrategy: Optional testing approach

Respond ONLY with a valid JSON object containing a single key "subtasks" whose value is an array matching the structure described. Do not include any explanatory text, markdown formatting, or code block markers.`;

          userPrompt = `Break down this task into exactly ${finalSubtaskCount} specific subtasks:

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Current details: ${task.details || 'None'}${additionalContext ? `\n\nAdditional context: ${additionalContext}` : ''}

Return ONLY the JSON object containing the "subtasks" array, matching this structure:
{
  "subtasks": [
    {
      "id": ${nextSubtaskId}, // First subtask ID
      "title": "Specific subtask title",
      "description": "Detailed description",
      "dependencies": [], // e.g., [${nextSubtaskId + 1}] if it depends on the next
      "details": "Implementation guidance",
      "testStrategy": "Optional testing approach"
    },
    // ... (repeat for a total of ${finalSubtaskCount} subtasks with sequential IDs)
  ]
}`;
        }
        
        // Create the instruction response for Claude to act upon
        const instructions = `I need you to expand this task into subtasks and then actually create them. Here's the complete process:

**STEP 1: Generate Subtasks JSON**
First, analyze the task and generate subtasks using these specifications:

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**STEP 2: Handle Force Option (if applicable)**
${force ? `Before creating new subtasks, call clear_subtasks with:
   - projectRoot: "${projectRoot}"
   - taskIds: "${taskId}"

` : ''}**STEP 3: Create Each Subtask**
After generating the subtasks JSON${force ? ' and clearing existing subtasks' : ''}, you MUST create each subtask by calling the add_subtask tool for each one. For each subtask in your generated JSON:

1. Call add_subtask with:
   - projectRoot: "${projectRoot}"
   - parentId: ${taskId}
   - title: [subtask title from your JSON]
   - description: [subtask description from your JSON]
   - details: [subtask details from your JSON]
   - dependencies: [convert subtask IDs to proper format, e.g., if dependencies: [2], convert to ["${taskId}.2"]]
   - status: "pending"

2. Repeat this for ALL subtasks in your generated JSON

**STEP 4: Completion**
After creating all subtasks, optionally run generate_task_files to create individual task files.

**IMPORTANT NOTES:**
- ${force ? 'Force mode enabled: existing subtasks will be cleared first' : 'These will be appended to any existing subtasks'}
- Dependencies should reference other subtasks using the format "parentId.subtaskId" (e.g., "${taskId}.1", "${taskId}.2")
- You MUST actually call add_subtask for each generated subtask - don't just show me the JSON

**START NOW:**
Begin with Step 1 (generate the subtasks JSON)${force ? ', then Step 2 (clear existing subtasks), then Step 3 (create each new subtask using add_subtask tool calls)' : ', then immediately proceed to Step 3 (create each subtask using add_subtask tool calls)'}.`;
        
        const result = {
          success: true,
          action: 'expand_task_guidance',
          targetFile: tasksPath,
          parameters: {
            taskId,
            finalSubtaskCount,
            research,
            additionalContext,
            force,
            nextSubtaskId,
            useComplexityPrompt
          },
          instructions
        };
        
        logger.info(`Generated task expansion instructions for task ${taskId} (${finalSubtaskCount} subtasks)${research ? ' with research mode' : ''}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to prepare task expansion instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare task expansion instructions: ${error.message}`);
      }
    }
  });
}
