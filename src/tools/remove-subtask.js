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
 * Register the remove-subtask tool
 * @param {Object} server - FastMCP server instance
 */
export function registerRemoveSubtaskTool(server) {
  server.addTool({
    name: 'remove_subtask',
    description: 'Remove a subtask from its parent task. Can either delete it permanently or convert it to a standalone task.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      subtaskIds: z
        .string()
        .describe('Subtask ID(s) to remove in format \"parentId.subtaskId\" (comma-separated for multiple)'),
      convertToTask: z
        .boolean()
        .optional()
        .default(false)
        .describe('Convert the subtask to a standalone task instead of deleting it')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, subtaskIds, convertToTask } = args;
        
        logger.info(`Removing subtasks: ${subtaskIds}${convertToTask ? ' (converting to tasks)' : ''}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        const subtaskIdList = subtaskIds.split(',').map(id => id.trim());
        const removedSubtasks = [];
        const convertedTasks = [];
        const errors = [];
        
        for (const subtaskId of subtaskIdList) {
          try {
            // Validate subtask ID format
            if (!subtaskId.includes('.')) {
              errors.push(`Invalid subtask ID format: ${subtaskId}. Must be in format \"parentId.subtaskId\"`);
              continue;
            }
            
            const [parentIdStr, subtaskIdStr] = subtaskId.split('.');
            const parentId = parseInt(parentIdStr, 10);
            const subtaskIdNum = parseInt(subtaskIdStr, 10);
            
            // Find parent task
            const parentTask = data.tasks.find(t => t.id === parentId);
            if (!parentTask) {
              errors.push(`Parent task ${parentId} not found`);
              continue;
            }
            
            if (!parentTask.subtasks || parentTask.subtasks.length === 0) {
              errors.push(`No subtasks found in parent task ${parentId}`);
              continue;
            }
            
            // Find subtask
            const subtaskIndex = parentTask.subtasks.findIndex(st => st.id === subtaskIdNum);
            if (subtaskIndex === -1) {
              errors.push(`Subtask ${subtaskId} not found`);
              continue;
            }
            
            const subtask = parentTask.subtasks[subtaskIndex];
            
            if (convertToTask) {
              // Convert to standalone task
              const newTaskId = getNextTaskId(data.tasks);
              
              const newTask = {
                ...subtask,
                id: newTaskId,
                updatedAt: new Date().toISOString()
              };
              
              // Remove parentTaskId property
              delete newTask.parentTaskId;
              
              // Add to main tasks array
              data.tasks.push(newTask);
              
              convertedTasks.push({
                originalId: subtaskId,
                newTaskId: newTaskId,
                title: newTask.title,
                status: newTask.status
              });
              
            } else {
              // Just remove
              removedSubtasks.push({
                id: subtaskId,
                title: subtask.title,
                status: subtask.status
              });
            }
            
            // Remove from parent's subtasks array
            parentTask.subtasks.splice(subtaskIndex, 1);
            parentTask.updatedAt = new Date().toISOString();
            
          } catch (error) {
            errors.push(`Error processing subtask ${subtaskId}: ${error.message}`);
          }
        }
        
        // Save updated data if any changes were made
        if (removedSubtasks.length > 0 || convertedTasks.length > 0) {
          if (!writeJSON(tasksPath, data)) {
            return createErrorResponse('Failed to save updated tasks');
          }
        }
        
        const result = {
          success: true,
          operation: convertToTask ? 'converted' : 'removed',
          summary: convertToTask ? 
            `Converted ${convertedTasks.length} subtask(s) to standalone task(s)` :
            `Removed ${removedSubtasks.length} subtask(s)`,
          removedSubtasks: removedSubtasks.length > 0 ? removedSubtasks : undefined,
          convertedTasks: convertedTasks.length > 0 ? convertedTasks : undefined,
          errors: errors.length > 0 ? errors : undefined
        };
        
        if (convertedTasks.length > 0) {
          result.nextSteps = convertedTasks.map(task => 
            `View converted task: show_task with taskId \"${task.newTaskId}\"`
          );
        }
        
        logger.info(`Completed subtask removal: ${removedSubtasks.length + convertedTasks.length} processed, ${errors.length} errors`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to remove subtask: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to remove subtask: ${error.message}`);
      }
    }
  });
}
