import { z } from 'zod';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  getStatusDisplay,
  formatDependencies,
  getTasksFilePath
} from './utils.js';

/**
 * Find the next task to work on based on dependencies and status
 * @param {Array} tasks - Array of all tasks
 * @returns {Object|null} Next task to work on or null if none available
 */
function findNextTask(tasks) {
  // Get completed task IDs
  const completedTaskIds = new Set(
    tasks
      .filter(t => t.status === 'done' || t.status === 'completed')
      .map(t => t.id)
  );
  
  // Find tasks that are:
  // 1. Not completed
  // 2. Have all dependencies satisfied OR no dependencies
  // 3. Are not blocked or deferred
  const eligibleTasks = tasks.filter(task => {
    // Skip completed tasks
    if (task.status === 'done' || task.status === 'completed') {
      return false;
    }
    
    // Skip blocked or deferred tasks
    if (task.status === 'blocked' || task.status === 'deferred' || task.status === 'cancelled') {
      return false;
    }
    
    // Check if all dependencies are satisfied
    if (task.dependencies && task.dependencies.length > 0) {
      return task.dependencies.every(depId => completedTaskIds.has(depId));
    }
    
    return true; // No dependencies, so eligible
  });
  
  if (eligibleTasks.length === 0) {
    return null;
  }
  
  // Prioritize by:
  // 1. In-progress tasks first
  // 2. High priority tasks
  // 3. Tasks with more dependent tasks
  // 4. Lower ID (older tasks)
  
  // Count dependents for each task
  const dependentCounts = new Map();
  
  tasks.forEach(task => {
    if (task.dependencies) {
      task.dependencies.forEach(depId => {
        dependentCounts.set(depId, (dependentCounts.get(depId) || 0) + 1);
      });
    }
    
    // Check subtask dependencies too
    if (task.subtasks) {
      task.subtasks.forEach(subtask => {
        if (subtask.dependencies) {
          subtask.dependencies.forEach(depId => {
            dependentCounts.set(depId, (dependentCounts.get(depId) || 0) + 1);
          });
        }
      });
    }
  });
  
  // Sort by priority criteria
  eligibleTasks.sort((a, b) => {
    // 1. In-progress tasks first
    if (a.status === 'in-progress' && b.status !== 'in-progress') return -1;
    if (b.status === 'in-progress' && a.status !== 'in-progress') return 1;
    
    // 2. Priority (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    if (aPriority !== bPriority) return bPriority - aPriority;
    
    // 3. More dependents first (more blocking)
    const aDependents = dependentCounts.get(a.id) || 0;
    const bDependents = dependentCounts.get(b.id) || 0;
    if (aDependents !== bDependents) return bDependents - aDependents;
    
    // 4. Lower ID (older tasks)
    return a.id - b.id;
  });
  
  return eligibleTasks[0];
}

/**
 * Register the next-task tool
 * @param {Object} server - FastMCP server instance
 */
export function registerNextTaskTool(server) {
  server.addTool({
    name: 'next_task',
    description: 'Find the next task to work on based on dependencies, status, and priority. Returns the most suitable task to start working on.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder')
    }),
    execute: async (args) => {
      try {
        const { projectRoot } = args;
        
        logger.info(`Finding next task to work on in project: ${projectRoot}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const data = readJSON(tasksPath);
        
        if (!data || !data.tasks) {
          return createErrorResponse(`No tasks found in ${tasksPath}. Run init first to create the project structure.`);
        }
        
        if (data.tasks.length === 0) {
          return createContentResponse({
            success: true,
            nextTask: null,
            message: 'No tasks available. Create some tasks first.',
            suggestion: 'Use the add_task tool or parse a PRD to create tasks.'
          });
        }
        
        const nextTask = findNextTask(data.tasks);
        
        if (!nextTask) {
          // Check why no task is available
          const totalTasks = data.tasks.length;
          const completedTasks = data.tasks.filter(t => 
            t.status === 'done' || t.status === 'completed'
          ).length;
          const blockedTasks = data.tasks.filter(t => 
            t.status === 'blocked' || t.status === 'deferred'
          ).length;
          const inProgressTasks = data.tasks.filter(t => 
            t.status === 'in-progress'
          ).length;
          
          const tasksWithUnsatisfiedDeps = data.tasks.filter(t => {
            if (t.status === 'done' || t.status === 'completed' || 
                t.status === 'blocked' || t.status === 'deferred' || 
                t.status === 'cancelled') {
              return false;
            }
            
            if (!t.dependencies || t.dependencies.length === 0) {
              return false;
            }
            
            const completedIds = new Set(
              data.tasks
                .filter(task => task.status === 'done' || task.status === 'completed')
                .map(task => task.id)
            );
            
            return !t.dependencies.every(depId => completedIds.has(depId));
          }).length;
          
          return createContentResponse({
            success: true,
            nextTask: null,
            message: 'No eligible tasks available to work on.',
            analysis: {
              totalTasks,
              completedTasks,
              inProgressTasks,
              blockedTasks,
              tasksWithUnsatisfiedDependencies: tasksWithUnsatisfiedDeps
            },
            suggestions: [
              completedTasks === totalTasks ? 'All tasks are completed! 🎉' : null,
              tasksWithUnsatisfiedDeps > 0 ? 'Some tasks are waiting for dependencies to be completed.' : null,
              blockedTasks > 0 ? 'Some tasks are blocked or deferred - consider reviewing their status.' : null,
              inProgressTasks > 0 ? 'Focus on completing the in-progress tasks first.' : null
            ].filter(Boolean)
          });
        }
        
        // Get additional details about the next task
        const taskDetails = {
          id: nextTask.id,
          title: nextTask.title,
          description: nextTask.description || 'No description',
          status: getStatusDisplay(nextTask.status),
          priority: nextTask.priority || 'medium',
          dependencies: formatDependencies(nextTask.dependencies, data.tasks)
        };
        
        // Add subtasks if any
        if (nextTask.subtasks && nextTask.subtasks.length > 0) {
          const subtaskStats = {
            total: nextTask.subtasks.length,
            completed: nextTask.subtasks.filter(st => 
              st.status === 'done' || st.status === 'completed'
            ).length,
            pending: nextTask.subtasks.filter(st => 
              st.status === 'pending'
            ).length,
            inProgress: nextTask.subtasks.filter(st => 
              st.status === 'in-progress'
            ).length
          };
          
          taskDetails.subtasks = {
            stats: subtaskStats,
            list: nextTask.subtasks.map(st => ({
              id: `${nextTask.id}.${st.id}`,
              title: st.title,
              status: getStatusDisplay(st.status)
            }))
          };
        }
        
        const result = {
          success: true,
          nextTask: taskDetails,
          recommendation: {
            action: nextTask.status === 'in-progress' ? 
              'Continue working on this in-progress task' : 
              'Start working on this task',
            setStatusCommand: `set_task_status with taskIds: \"${nextTask.id}\" and status: \"in-progress\"`,
            viewDetailsCommand: `show_task with taskId: \"${nextTask.id}\"`
          }
        };
        
        logger.info(`Found next task: ${nextTask.id} - ${nextTask.title}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to find next task: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to find next task: ${error.message}`);
      }
    }
  });
}
