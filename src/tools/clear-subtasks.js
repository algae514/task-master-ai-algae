import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  writeJSON,
  getTasksFilePath
} from './utils.js';

/**
 * Register the clear-subtasks tool
 * @param {Object} server - FastMCP server instance
 */
export function registerClearSubtasksTool(server) {
  server.addTool({
    name: 'clear_subtasks',
    description: 'Clear all subtasks from specified parent tasks or all tasks.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskIds: z
        .string()
        .optional()
        .describe('Comma-separated task IDs to clear subtasks from. If not provided, clears subtasks from all tasks.'),
      all: z
        .boolean()
        .optional()
        .default(false)
        .describe('Clear subtasks from all tasks (overrides taskIds parameter)')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskIds, all } = args;
        
        logger.info(`Clearing subtasks${all ? ' from all tasks' : taskIds ? ` from tasks: ${taskIds}` : ''}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        let targetTasks = [];
        
        if (all) {
          // Clear subtasks from all tasks
          targetTasks = data.tasks.filter(task => task.subtasks && task.subtasks.length > 0);
        } else if (taskIds) {
          // Clear subtasks from specified tasks
          const taskIdList = taskIds.split(',').map(id => parseInt(id.trim(), 10));
          targetTasks = data.tasks.filter(task => 
            taskIdList.includes(task.id) && task.subtasks && task.subtasks.length > 0
          );
        } else {
          return createErrorResponse('Either provide taskIds or set all=true to clear subtasks');
        }
        
        if (targetTasks.length === 0) {
          return createContentResponse({
            success: true,
            message: 'No tasks with subtasks found to clear',
            clearedTasks: []
          });
        }
        
        const clearedTasks = [];
        let totalSubtasksCleared = 0;
        
        targetTasks.forEach(task => {
          const subtaskCount = task.subtasks.length;
          
          clearedTasks.push({
            taskId: task.id,
            title: task.title,
            subtasksCleared: subtaskCount
          });
          
          totalSubtasksCleared += subtaskCount;
          
          // Clear the subtasks
          task.subtasks = [];
          task.updatedAt = new Date().toISOString();
        });
        
        // Save updated data
        if (!writeJSON(tasksPath, data)) {
          return createErrorResponse('Failed to save updated tasks');
        }
        
        const result = {
          success: true,
          summary: {
            tasksProcessed: clearedTasks.length,
            totalSubtasksCleared,
            operation: all ? 'cleared_all' : 'cleared_selected'
          },
          clearedTasks,
          message: `Successfully cleared ${totalSubtasksCleared} subtasks from ${clearedTasks.length} task(s)`
        };
        
        logger.info(`Cleared ${totalSubtasksCleared} subtasks from ${clearedTasks.length} tasks`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to clear subtasks: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to clear subtasks: ${error.message}`);
      }
    }
  });
}
