import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  findTaskById,
  getStatusDisplay,
  formatDependencies,
  truncateText,
  getTasksFilePath
} from './utils.js';

/**
 * Register the list-tasks tool
 * @param {Object} server - FastMCP server instance
 */
export function registerListTasksTool(server) {
  server.addTool({
    name: 'list_tasks',
    description: 'List all tasks with optional filtering by status. Shows task details, dependencies, and completion statistics.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      statusFilter: z
        .string()
        .optional()
        .describe('Filter tasks by status (pending, in-progress, done, completed, blocked, deferred, cancelled). Use \"all\" for no filter.'),
      withSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in the listing')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, statusFilter, withSubtasks } = args;
        
        logger.info(`Listing tasks from project: ${projectRoot}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        // Filter tasks by status if specified
        let filteredTasks = data.tasks;
        if (statusFilter && statusFilter.toLowerCase() !== 'all') {
          filteredTasks = data.tasks.filter(task => 
            task.status && task.status.toLowerCase() === statusFilter.toLowerCase()
          );
        }
        
        // Calculate statistics
        const totalTasks = data.tasks.length;
        const completedTasks = data.tasks.filter(t => 
          t.status === 'done' || t.status === 'completed'
        ).length;
        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // Count by status
        const statusCounts = {
          pending: data.tasks.filter(t => t.status === 'pending').length,
          'in-progress': data.tasks.filter(t => t.status === 'in-progress').length,
          done: data.tasks.filter(t => t.status === 'done' || t.status === 'completed').length,
          blocked: data.tasks.filter(t => t.status === 'blocked').length,
          deferred: data.tasks.filter(t => t.status === 'deferred').length,
          cancelled: data.tasks.filter(t => t.status === 'cancelled').length
        };
        
        // Count subtasks if requested
        let subtaskStats = null;
        if (withSubtasks) {
          let totalSubtasks = 0;
          let completedSubtasks = 0;
          
          data.tasks.forEach(task => {
            if (task.subtasks && task.subtasks.length > 0) {
              totalSubtasks += task.subtasks.length;
              completedSubtasks += task.subtasks.filter(st => 
                st.status === 'done' || st.status === 'completed'
              ).length;
            }
          });
          
          subtaskStats = {
            total: totalSubtasks,
            completed: completedSubtasks,
            completionPercentage: totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
          };
        }
        
        // Format task list
        const taskList = [];
        
        filteredTasks.forEach(task => {
          const taskInfo = {
            id: task.id,
            title: task.title,
            description: truncateText(task.description, 100),
            status: getStatusDisplay(task.status),
            priority: task.priority || 'medium',
            dependencies: formatDependencies(task.dependencies, data.tasks)
          };
          
          taskList.push(taskInfo);
          
          // Add subtasks if requested
          if (withSubtasks && task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
              taskList.push({
                id: `${task.id}.${subtask.id}`,
                title: `  └─ ${subtask.title}`,
                description: truncateText(subtask.description, 80),
                status: getStatusDisplay(subtask.status),
                priority: '-',
                dependencies: formatDependencies(subtask.dependencies, data.tasks)
              });
            });
          }
        });
        
        const result = {
          success: true,
          summary: {
            totalTasks,
            filteredTasks: filteredTasks.length,
            completionPercentage,
            statusCounts,
            filter: statusFilter || 'all'
          },
          tasks: taskList
        };
        
        if (subtaskStats) {
          result.summary.subtaskStats = subtaskStats;
        }
        
        logger.info(`Listed ${filteredTasks.length} tasks (${totalTasks} total)`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to list tasks: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to list tasks: ${error.message}`);
      }
    }
  });
}
