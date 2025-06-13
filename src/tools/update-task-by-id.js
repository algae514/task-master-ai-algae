import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Register the update-task-by-id tool
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateTaskByIdTool(server) {
  server.addTool({
    name: 'update_task_by_id',
    description: 'Update a single task by ID using AI guidance. Returns detailed instructions for Claude to execute the task update.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskId: z
        .number()
        .describe('Task ID to update'),
      prompt: z
        .string()
        .describe('Prompt with new context for updating the task'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task updating')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskId, prompt, research } = args;
        
        logger.info(`Preparing task update instructions for task ${taskId} with prompt: "${prompt}"`);
        
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
            return createErrorResponse(`No valid tasks found in ${tasksPath}`);
          }
        } catch (error) {
          return createErrorResponse(`Failed to read tasks file: ${error.message}`);
        }
        
        // Find the task to update
        const task = tasksData.tasks.find(t => t.id === taskId);
        if (!task) {
          return createErrorResponse(`Task with ID ${taskId} not found`);
        }
        
        // Check if task is completed
        if (task.status === 'done' || task.status === 'completed') {
          return createErrorResponse(`Task ${taskId} is already marked as ${task.status} and cannot be updated. Completed tasks are locked to maintain consistency. To modify a completed task, you must first change its status to "pending" or "in-progress", then run the update-task command.`);
        }
        
        // Extract the exact system prompt from the reference implementation
        const systemPrompt = `You are an AI assistant helping to update a software development task based on new context.
You will be given a task and a prompt describing changes or new implementation details.
Your job is to update the task to reflect these changes, while preserving its basic structure.

Guidelines:
1. VERY IMPORTANT: NEVER change the title of the task - keep it exactly as is
2. Maintain the same ID, status, and dependencies unless specifically mentioned in the prompt
3. Update the description, details, and test strategy to reflect the new information
4. Do not change anything unnecessarily - just adapt what needs to change based on the prompt
5. Return a complete valid JSON object representing the updated task
6. VERY IMPORTANT: Preserve all subtasks marked as "done" or "completed" - do not modify their content
7. For tasks with completed subtasks, build upon what has already been done rather than rewriting everything
8. If an existing completed subtask needs to be changed/undone based on the new context, DO NOT modify it directly
9. Instead, add a new subtask that clearly indicates what needs to be changed or replaced
10. Use the existence of completed subtasks as an opportunity to make new subtasks more specific and targeted
11. Ensure any new subtasks have unique IDs that don't conflict with existing ones

The changes described in the prompt should be thoughtfully applied to make the task more accurate and actionable.`;

        const taskDataString = JSON.stringify(task, null, 2);
        const userPrompt = `Here is the task to update:\n${taskDataString}\n\nPlease update this task based on the following new context:\n${prompt}\n\nIMPORTANT: In the task JSON above, any subtasks with "status": "done" or "status": "completed" should be preserved exactly as is. Build your changes around these completed items.\n\nReturn only the updated task as a valid JSON object.`;
        
        // Create the instruction response for Claude to act upon
        const instructions = `I can guide you through updating this specific task. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the task and new context provided above and generate the updated task JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the updated task from your response
2. Validate that the task ID matches ${taskId} and preserve any completed subtasks
3. Update the specific task in ${tasksPath}
4. Use the generate_task_files tool to create individual task files
5. Confirm the task was updated successfully

Please proceed with updating the task now based on the context and instructions above.`;
        
        const result = {
          success: true,
          action: 'update_task_by_id_guidance',
          targetFile: tasksPath,
          parameters: {
            taskId,
            prompt,
            research,
            taskTitle: task.title,
            taskStatus: task.status
          },
          instructions
        };
        
        logger.info(`Generated task update instructions for task ${taskId}${research ? ' with research mode' : ''}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to prepare task update instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare task update instructions: ${error.message}`);
      }
    }
  });
}
