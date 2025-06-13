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
        const instructions = `I can guide you through expanding this task into subtasks. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the task provided above and generate the subtasks JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the subtasks from your response
2. ${force ? 'Replace existing subtasks' : 'Append new subtasks'} for task ${taskId} in ${tasksPath}
3. Use the generate_task_files tool to create individual task files
4. Confirm the subtasks were created successfully

Please proceed with generating the subtasks now based on the task details and instructions above.`;
        
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
