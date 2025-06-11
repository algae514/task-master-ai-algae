import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  writeJSON,
  findTaskById,
  getNextTaskId,
  getTasksFilePath
} from './utils.js';

/**
 * Register the add-subtask tool
 * @param {Object} server - FastMCP server instance
 */
export function registerAddSubtaskTool(server) {
  server.addTool({
    name: 'add_subtask',
    description: 'Add a subtask to an existing parent task or convert an existing task to a subtask.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      parentId: z
        .number()
        .describe('ID of the parent task to add the subtask to'),
      existingTaskId: z
        .number()
        .optional()
        .describe('ID of an existing task to convert to a subtask (optional)'),
      title: z
        .string()
        .optional()
        .describe('Title for the new subtask (required if not converting existing task)'),
      description: z
        .string()
        .optional()
        .describe('Description for the new subtask'),
      details: z
        .string()
        .optional()
        .describe('Implementation details for the new subtask'),
      dependencies: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .default([])
        .describe('Array of dependency IDs for the new subtask'),
      status: z
        .string()
        .optional()
        .default('pending')
        .describe('Status for the new subtask (default: pending)')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, parentId, existingTaskId, title, description, details, dependencies, status } = args;
        
        logger.info(`Adding subtask to parent task ${parentId}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        // Find the parent task
        const parentTask = data.tasks.find(t => t.id === parentId);
        if (!parentTask) {
          return createErrorResponse(`Parent task with ID ${parentId} not found`);
        }
        
        // Initialize subtasks array if it doesn't exist
        if (!parentTask.subtasks) {
          parentTask.subtasks = [];
        }
        
        let newSubtask;
        let operationType;
        
        // Case 1: Convert existing task to subtask
        if (existingTaskId !== undefined) {
          const existingTaskIndex = data.tasks.findIndex(t => t.id === existingTaskId);
          if (existingTaskIndex === -1) {
            return createErrorResponse(`Task with ID ${existingTaskId} not found`);
          }
          
          const existingTask = data.tasks[existingTaskIndex];
          
          // Check if task is already a subtask
          if (existingTask.parentTaskId) {
            return createErrorResponse(`Task ${existingTaskId} is already a subtask of task ${existingTask.parentTaskId}`);
          }
          
          // Check for circular dependency
          if (existingTaskId === parentId) {
            return createErrorResponse('Cannot make a task a subtask of itself');
          }
          
          // Find the highest subtask ID to determine the next ID
          const highestSubtaskId = parentTask.subtasks.length > 0 ? 
            Math.max(...parentTask.subtasks.map(st => st.id)) : 0;
          const newSubtaskId = highestSubtaskId + 1;
          
          // Create subtask from existing task
          newSubtask = {
            ...existingTask,
            id: newSubtaskId,
            parentTaskId: parentId
          };
          
          // Remove from main tasks array
          data.tasks.splice(existingTaskIndex, 1);
          operationType = 'converted';
          
        } else {
          // Case 2: Create new subtask
          if (!title) {
            return createErrorResponse('Title is required when creating a new subtask');
          }
          
          // Find the highest subtask ID to determine the next ID
          const highestSubtaskId = parentTask.subtasks.length > 0 ? 
            Math.max(...parentTask.subtasks.map(st => st.id)) : 0;
          const newSubtaskId = highestSubtaskId + 1;
          
          newSubtask = {
            id: newSubtaskId,
            title,
            description: description || '',
            details: details || '',
            status: status || 'pending',
            dependencies: dependencies || [],
            parentTaskId: parentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          operationType = 'created';
        }
        
        // Add to parent's subtasks
        parentTask.subtasks.push(newSubtask);
        
        // Update parent's updatedAt
        parentTask.updatedAt = new Date().toISOString();
        
        // Save updated data
        if (!writeJSON(tasksPath, data)) {
          return createErrorResponse('Failed to save updated tasks');
        }
        
        const result = {
          success: true,
          operation: operationType,
          subtask: {
            id: `${parentId}.${newSubtask.id}`,
            title: newSubtask.title,
            description: newSubtask.description,
            status: newSubtask.status,
            dependencies: newSubtask.dependencies,
            parentTask: {
              id: parentTask.id,
              title: parentTask.title
            }
          },
          message: operationType === 'converted' ? 
            `Successfully converted task ${existingTaskId} to subtask ${parentId}.${newSubtask.id}` :
            `Successfully created new subtask ${parentId}.${newSubtask.id}`,
          nextSteps: [
            `View parent task: show_task with taskId \"${parentId}\"`,
            `Set subtask status: set_task_status with taskIds \"${parentId}.${newSubtask.id}\" and status \"in-progress\"`
          ]
        };
        
        logger.info(`${operationType === 'converted' ? 'Converted' : 'Created'} subtask ${parentId}.${newSubtask.id}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to add subtask: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to add subtask: ${error.message}`);
      }
    }
  });
}
