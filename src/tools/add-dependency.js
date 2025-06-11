import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  writeJSON,
  findTaskById,
  getTasksFilePath
} from './utils.js';

/**
 * Register the add-dependency tool
 * @param {Object} server - FastMCP server instance
 */
export function registerAddDependencyTool(server) {
  server.addTool({
    name: 'add_dependency',
    description: 'Add a dependency relationship between tasks. The target task will depend on the dependency task.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      taskId: z
        .string()
        .describe('ID of the task that will have the dependency (can be task or subtask ID like \"5\" or \"5.2\")'),
      dependsOn: z
        .string()
        .describe('ID of the task that becomes a dependency (can be task or subtask ID like \"3\" or \"3.1\")')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, taskId, dependsOn } = args;
        
        logger.info(`Adding dependency: task ${taskId} depends on ${dependsOn}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        // Find the target task
        const targetResult = findTaskById(data.tasks, taskId);
        if (!targetResult) {
          return createErrorResponse(`Task ${taskId} not found`);
        }
        
        // Find the dependency task
        const dependencyResult = findTaskById(data.tasks, dependsOn);
        if (!dependencyResult) {
          return createErrorResponse(`Dependency task ${dependsOn} not found`);
        }
        
        const targetTask = targetResult.task;
        const dependencyTask = dependencyResult.task;
        
        // Check for circular dependency
        if (taskId === dependsOn) {
          return createErrorResponse('A task cannot depend on itself');
        }
        
        // Initialize dependencies array if it doesn't exist
        if (!targetTask.dependencies) {
          targetTask.dependencies = [];
        }
        
        // Convert dependsOn to appropriate format
        let dependencyId;
        if (dependsOn.includes('.')) {
          // It's a subtask dependency, keep as string
          dependencyId = dependsOn;
        } else {
          // It's a regular task dependency, convert to number
          dependencyId = parseInt(dependsOn, 10);
        }
        
        // Check if dependency already exists
        const alreadyExists = targetTask.dependencies.some(dep => 
          dep === dependencyId || dep.toString() === dependencyId.toString()
        );
        
        if (alreadyExists) {
          return createErrorResponse(`Task ${taskId} already depends on ${dependsOn}`);
        }
        
        // Add the dependency
        targetTask.dependencies.push(dependencyId);
        
        // Update timestamp
        if (targetResult.parent) {
          targetResult.parent.updatedAt = new Date().toISOString();
        } else {
          targetTask.updatedAt = new Date().toISOString();
        }
        
        // Save updated data
        if (!writeJSON(tasksPath, data)) {
          return createErrorResponse('Failed to save updated tasks');
        }
        
        const result = {
          success: true,
          dependency: {
            task: {
              id: taskId,
              title: targetTask.title,
              type: targetResult.isSubtask ? 'subtask' : 'task'
            },
            dependsOn: {
              id: dependsOn,
              title: dependencyTask.title,
              type: dependencyResult.isSubtask ? 'subtask' : 'task'
            }
          },
          message: `Successfully added dependency: ${taskId} now depends on ${dependsOn}`,
          allDependencies: targetTask.dependencies
        };
        
        logger.info(`Added dependency: ${taskId} -> ${dependsOn}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to add dependency: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to add dependency: ${error.message}`);
      }
    }
  });
}
