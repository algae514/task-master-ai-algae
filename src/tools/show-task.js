import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  findTaskById,
  getStatusDisplay,
  formatDependencies,
  getTasksFilePath
} from './utils.js';

/**
 * Register the show-task tool
 * @param {Object} server - FastMCP server instance
 */
export function registerShowTaskTool(server) {
  server.addTool({
    name: 'show_task',
    description: 'Display detailed information about a specific task or subtask, including all properties, subtasks, and dependencies.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskId: z
        .string()
        .describe('Task ID to show (e.g., \"5\" for task or \"5.2\" for subtask)'),
      statusFilter: z
        .string()
        .optional()
        .describe('Filter subtasks by status when showing a parent task')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskId, statusFilter } = args;
        
        logger.info(`Showing details for task ${taskId}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        const result = findTaskById(data.tasks, taskId);
        
        if (!result) {
          return createErrorResponse(`Task ${taskId} not found`);
        }
        
        const { task, parent, isSubtask } = result;
        
        // Build detailed task information
        const taskDetails = {
          id: isSubtask ? `${parent.id}.${task.id}` : task.id,
          type: isSubtask ? 'subtask' : 'task',
          title: task.title,
          description: task.description || 'No description',
          details: task.details || 'No implementation details',
          status: getStatusDisplay(task.status),
          priority: task.priority || 'medium',
          dependencies: formatDependencies(task.dependencies, data.tasks),
          createdAt: task.createdAt || 'Unknown',
          updatedAt: task.updatedAt || 'Unknown'
        };
        
        // Add parent info if it's a subtask
        if (isSubtask) {
          taskDetails.parentTask = {
            id: parent.id,
            title: parent.title,
            status: getStatusDisplay(parent.status)
          };
        }
        
        // Add subtasks if it's a parent task
        if (!isSubtask && task.subtasks && task.subtasks.length > 0) {
          let subtasks = task.subtasks;
          
          // Filter subtasks by status if specified
          if (statusFilter && statusFilter.toLowerCase() !== 'all') {
            subtasks = task.subtasks.filter(st => 
              st.status && st.status.toLowerCase() === statusFilter.toLowerCase()
            );
          }
          
          taskDetails.subtasks = subtasks.map(subtask => ({
            id: `${task.id}.${subtask.id}`,
            title: subtask.title,
            description: subtask.description || 'No description',
            status: getStatusDisplay(subtask.status),
            dependencies: formatDependencies(subtask.dependencies, data.tasks)
          }));
          
          // Add subtask statistics
          const totalSubtasks = task.subtasks.length;
          const completedSubtasks = task.subtasks.filter(st => 
            st.status === 'done' || st.status === 'completed'
          ).length;
          
          taskDetails.subtaskStats = {
            total: totalSubtasks,
            completed: completedSubtasks,
            shown: subtasks.length,
            completionPercentage: totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0,
            filter: statusFilter || 'all'
          };
        }
        
        // Find tasks that depend on this task
        const dependentTasks = [];
        const currentTaskId = isSubtask ? `${parent.id}.${task.id}` : task.id;
        
        data.tasks.forEach(t => {
          if (t.dependencies && t.dependencies.includes(parseInt(taskId, 10))) {
            dependentTasks.push({
              id: t.id,
              title: t.title,
              status: getStatusDisplay(t.status)
            });
          }
          
          // Check subtasks too
          if (t.subtasks) {
            t.subtasks.forEach(st => {
              if (st.dependencies && (
                st.dependencies.includes(parseInt(taskId, 10)) ||
                st.dependencies.includes(currentTaskId)
              )) {
                dependentTasks.push({
                  id: `${t.id}.${st.id}`,
                  title: st.title,
                  status: getStatusDisplay(st.status)
                });
              }
            });
          }
        });
        
        if (dependentTasks.length > 0) {
          taskDetails.dependentTasks = dependentTasks;
        }
        
        // Add test strategy if present
        if (task.testStrategy) {
          taskDetails.testStrategy = task.testStrategy;
        }
        
        const response = {
          success: true,
          task: taskDetails
        };
        
        logger.info(`Retrieved details for task ${taskId}`);
        
        return createContentResponse(response);
      } catch (error) {
        logger.error(`Failed to show task: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to show task: ${error.message}`);
      }
    }
  });
}
