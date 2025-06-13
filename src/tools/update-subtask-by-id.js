import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Register the update-subtask-by-id tool
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateSubtaskByIdTool(server) {
  server.addTool({
    name: 'update_subtask_by_id',
    description: 'Update a subtask by appending additional timestamped information using AI guidance. Returns detailed instructions for Claude to execute the subtask update.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      subtaskId: z
        .string()
        .describe('ID of the subtask to update in format "parentId.subtaskId"'),
      prompt: z
        .string()
        .describe('Prompt for generating additional information for the subtask'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced subtask updating')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, subtaskId, prompt, research } = args;
        
        logger.info(`Preparing subtask update instructions for subtask ${subtaskId} with prompt: "${prompt}"`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        // Validate subtask ID format
        if (!subtaskId || typeof subtaskId !== 'string' || !subtaskId.includes('.')) {
          return createErrorResponse(`Invalid subtask ID format: ${subtaskId}. Subtask ID must be in format "parentId.subtaskId"`);
        }
        
        // Validate tasks file exists
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found: ${tasksPath}`);
        }
        
        // Read and validate tasks data
        let tasksData;
        try {
          tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
          if (!tasksData || !tasksData.tasks) {
            return createErrorResponse(`No valid tasks found in ${tasksPath}`);
          }
        } catch (error) {
          return createErrorResponse(`Failed to read tasks file: ${error.message}`);
        }
        
        // Parse subtask ID
        const [parentIdStr, subtaskIdStr] = subtaskId.split('.');
        const parentId = parseInt(parentIdStr, 10);
        const subtaskIdNum = parseInt(subtaskIdStr, 10);
        
        if (isNaN(parentId) || parentId <= 0 || isNaN(subtaskIdNum) || subtaskIdNum <= 0) {
          return createErrorResponse(`Invalid subtask ID format: ${subtaskId}. Both parent ID and subtask ID must be positive integers.`);
        }
        
        // Find parent task
        const parentTask = tasksData.tasks.find(task => task.id === parentId);
        if (!parentTask) {
          return createErrorResponse(`Parent task with ID ${parentId} not found. Please verify the task ID and try again.`);
        }
        
        if (!parentTask.subtasks || !Array.isArray(parentTask.subtasks)) {
          return createErrorResponse(`Parent task ${parentId} has no subtasks.`);
        }
        
        // Find subtask
        const subtask = parentTask.subtasks.find(st => st.id === subtaskIdNum);
        if (!subtask) {
          return createErrorResponse(`Subtask with ID ${subtaskId} not found. Please verify the subtask ID and try again.`);
        }
        
        // Build context information
        const subtaskIndex = parentTask.subtasks.findIndex(st => st.id === subtaskIdNum);
        const parentContext = {
          id: parentTask.id,
          title: parentTask.title
        };
        const prevSubtask = subtaskIndex > 0 ? {
          id: `${parentTask.id}.${parentTask.subtasks[subtaskIndex - 1].id}`,
          title: parentTask.subtasks[subtaskIndex - 1].title,
          status: parentTask.subtasks[subtaskIndex - 1].status
        } : null;
        const nextSubtask = subtaskIndex < parentTask.subtasks.length - 1 ? {
          id: `${parentTask.id}.${parentTask.subtasks[subtaskIndex + 1].id}`,
          title: parentTask.subtasks[subtaskIndex + 1].title,
          status: parentTask.subtasks[subtaskIndex + 1].status
        } : null;
        
        const contextString = `
Parent Task: ${JSON.stringify(parentContext)}
${prevSubtask ? `Previous Subtask: ${JSON.stringify(prevSubtask)}` : ''}
${nextSubtask ? `Next Subtask: ${JSON.stringify(nextSubtask)}` : ''}
Current Subtask Details (for context only):\n${subtask.details || '(No existing details)'}
`;
        
        // Extract the exact system prompt from the reference implementation
        const systemPrompt = `You are an AI assistant helping to update a subtask. You will be provided with the subtask's existing details, context about its parent and sibling tasks, and a user request string.

Your Goal: Based *only* on the user's request and all the provided context (including existing details if relevant to the request), GENERATE the new text content that should be added to the subtask's details.
Focus *only* on generating the substance of the update.

Output Requirements:
1. Return *only* the newly generated text content as a plain string. Do NOT return a JSON object or any other structured data.
2. Your string response should NOT include any of the subtask's original details, unless the user's request explicitly asks to rephrase, summarize, or directly modify existing text.
3. Do NOT include any timestamps, XML-like tags, markdown, or any other special formatting in your string response.
4. Ensure the generated text is concise yet complete for the update based on the user request. Avoid conversational fillers or explanations about what you are doing (e.g., do not start with "Okay, here's the update...").`;

        const userPrompt = `Task Context:\n${contextString}\n\nUser Request: "${prompt}"\n\nBased on the User Request and all the Task Context (including current subtask details provided above), what is the new information or text that should be appended to this subtask's details? Return ONLY this new text as a plain string.`;
        
        // Create the instruction response for Claude to act upon
        const instructions = `I can guide you through updating this specific subtask. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the subtask context and user request provided above and generate the new text content according to the specifications. Once you create the text response, you should:

1. Take your generated text content (plain string, no JSON)
2. Add a timestamp wrapper: "<info added on [current ISO timestamp]>\\n[your text content]\\n</info added on [current ISO timestamp]>"
3. Append this formatted block to the existing subtask details in ${tasksPath}
4. Update the subtask description with a brief "[Updated: [current date]]" suffix if the prompt is short
5. Use the generate_task_files tool to create individual task files
6. Confirm the subtask was updated successfully

**SUBTASK LOCATION:**
- Parent Task ID: ${parentId}
- Subtask ID: ${subtaskIdNum}
- Full Subtask ID: ${subtaskId}

Please proceed with generating the new content for the subtask now based on the context and instructions above.`;
        
        const result = {
          success: true,
          action: 'update_subtask_by_id_guidance',
          targetFile: tasksPath,
          parameters: {
            subtaskId,
            parentId,
            subtaskIdNum,
            prompt,
            research,
            subtaskTitle: subtask.title,
            subtaskStatus: subtask.status
          },
          instructions
        };
        
        logger.info(`Generated subtask update instructions for subtask ${subtaskId}${research ? ' with research mode' : ''}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to prepare subtask update instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare subtask update instructions: ${error.message}`);
      }
    }
  });
}
