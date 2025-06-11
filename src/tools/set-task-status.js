import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  writeJSON,
  findTaskById,
  isValidTaskStatus,
  getTasksFilePath
} from './utils.js';

/**
 * Register the set-task-status tool
 * @param {Object} server - FastMCP server instance
 */
export function registerSetTaskStatusTool(server) {
  server.addTool({
    name: 'set_task_status',
    description: 'Set the status of one or more tasks/subtasks. Supports comma-separated task IDs.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskIds: z
        .string()
        .describe('Task ID(s) to update. Can be comma-separated for multiple tasks (e.g., \"1,2,3\" or \"1,2.1,3\")'),
      status: z
        .string()
        .describe('New status: pending, in-progress, done, completed, blocked, deferred, or cancelled')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskIds, status } = args;
        
        logger.info(`Setting status of tasks ${taskIds} to ${status}`);
        
        // Validate status
        if (!isValidTaskStatus(status)) {
          return createErrorResponse(`Invalid status: ${status}. Valid statuses are: pending, in-progress, done, completed, blocked, deferred, cancelled`);
        }
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        // Parse task IDs
        const taskIdList = taskIds.split(',').map(id => id.trim());
        const updatedTasks = [];
        const errors = [];
        
        // Update each task
        for (const taskId of taskIdList) {
          try {
            const result = findTaskById(data.tasks, taskId);
            
            if (!result) {
              errors.push(`Task ${taskId} not found`);
              continue;
            }
            
            const oldStatus = result.task.status;
            result.task.status = status;
            
            updatedTasks.push({
              id: taskId,
              title: result.task.title,
              oldStatus,
              newStatus: status,
              isSubtask: result.isSubtask
            });
            
            logger.info(`Updated task ${taskId} status from ${oldStatus} to ${status}`);
          } catch (error) {
            errors.push(`Error updating task ${taskId}: ${error.message}`);
          }
        }
        
        // Save updated data
        if (updatedTasks.length > 0) {
          if (!writeJSON(tasksPath, data)) {
            return createErrorResponse('Failed to save updated tasks');
          }
        }
        
        const result = {
          success: true,
          updatedTasks,
          errors: errors.length > 0 ? errors : undefined,
          summary: `Updated ${updatedTasks.length} task(s) to status: ${status}`
        };
        
        if (errors.length > 0) {
          result.summary += `. ${errors.length} error(s) occurred.`;
        }
        
        logger.info(`Status update completed: ${updatedTasks.length} successful, ${errors.length} errors`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to set task status: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to set task status: ${error.message}`);
      }
    }
  });
}
