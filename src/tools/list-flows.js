import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Analyze flow distribution and generate statistics
 * @param {Array} allTasks - All tasks in the project
 * @param {boolean} includeSubtasks - Whether to include subtasks in analysis
 * @returns {Object} Flow analysis data
 */
function analyzeFlows(allTasks, includeSubtasks = false) {
  const flowCounts = {};
  const flowTasks = {};
  const taskFlowMap = {};
  const flowDependencies = {};
  
  // Process main tasks
  for (const task of allTasks) {
    if (task.flowNames && Array.isArray(task.flowNames)) {
      taskFlowMap[task.id] = task.flowNames;
      
      for (const flow of task.flowNames) {
        flowCounts[flow] = (flowCounts[flow] || 0) + 1;
        if (!flowTasks[flow]) {
          flowTasks[flow] = [];
        }
        flowTasks[flow].push({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority || 'medium',
          dependencies: task.dependencies || []
        });
        
        // Track flow dependencies
        if (task.dependencies && task.dependencies.length > 0) {
          if (!flowDependencies[flow]) {
            flowDependencies[flow] = new Set();
          }
          // Find flows that this flow depends on
          for (const depId of task.dependencies) {
            const depTask = allTasks.find(t => t.id === depId);
            if (depTask && depTask.flowNames) {
              depTask.flowNames.forEach(depFlow => {
                if (depFlow !== flow) {
                  flowDependencies[flow].add(depFlow);
                }
              });
            }
          }
        }
      }
    }
    
    // Process subtasks if requested
    if (includeSubtasks && task.subtasks && Array.isArray(task.subtasks)) {
      for (const subtask of task.subtasks) {
        if (subtask.flowNames && Array.isArray(subtask.flowNames)) {
          const subtaskId = `${task.id}.${subtask.id}`;
          taskFlowMap[subtaskId] = subtask.flowNames;
          
          for (const flow of subtask.flowNames) {
            flowCounts[flow] = (flowCounts[flow] || 0) + 1;
            if (!flowTasks[flow]) {
              flowTasks[flow] = [];
            }
            flowTasks[flow].push({
              id: subtaskId,
              title: subtask.title,
              status: subtask.status,
              priority: subtask.priority || 'medium',
              isSubtask: true,
              parentTaskId: task.id,
              parentTaskTitle: task.title,
              dependencies: subtask.dependencies || []
            });
          }
        }
      }
    }
  }
  
  // Convert sets to arrays for JSON serialization
  const flowDependenciesMap = {};
  for (const [flow, depSet] of Object.entries(flowDependencies)) {
    flowDependenciesMap[flow] = Array.from(depSet);
  }
  
  const allFlows = Object.keys(flowCounts);
  const topFlows = Object.entries(flowCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .map(([flow, count]) => ({ flow, count }));
  
  // Calculate flow completion status
  const flowCompletionStatus = {};
  for (const [flow, tasks] of Object.entries(flowTasks)) {
    const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const totalTasks = tasks.length;
    flowCompletionStatus[flow] = {
      completed: completedTasks,
      total: totalTasks,
      percentage: totalTasks > 0 ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(1)) : 0,
      status: completedTasks === totalTasks ? 'completed' : 
               completedTasks === 0 ? 'not-started' : 'in-progress'
    };
  }
  
  return {
    totalFlows: allFlows.length,
    totalUsages: Object.values(flowCounts).reduce((sum, count) => sum + count, 0),
    averageFlowsPerTask: Object.keys(taskFlowMap).length > 0 ? 
      Object.values(taskFlowMap).reduce((sum, flows) => sum + flows.length, 0) / Object.keys(taskFlowMap).length : 0,
    flowCounts,
    flowTasks,
    topFlows,
    flowCompletionStatus,
    flowDependencies: flowDependenciesMap,
    allFlows: allFlows.sort(),
    tasksWithFlows: Object.keys(taskFlowMap).length,
    tasksWithoutFlows: allTasks.length - Object.keys(taskFlowMap).filter(id => !id.includes('.')).length
  };
}

/**
 * Register the list-flows tool
 * @param {Object} server - FastMCP server instance
 */
export function registerListFlowsTool(server) {
  server.addTool({
    name: 'list_flows',
    description: 'List all business flows used across tasks with usage statistics, completion status, dependency analysis, and filtering options.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in flow analysis'),
      sortBy: z
        .enum(['frequency', 'alphabetical', 'tasks', 'completion'])
        .optional()
        .default('frequency')
        .describe('Sort flows by frequency, alphabetical order, number of tasks, or completion percentage'),
      minUsage: z
        .number()
        .optional()
        .default(1)
        .describe('Minimum usage count to include flow (default: 1)'),
      maxResults: z
        .number()
        .optional()
        .default(100)
        .describe('Maximum number of flows to return (default: 100)'),
      searchPattern: z
        .string()
        .optional()
        .describe('Filter flows by pattern (case-insensitive substring match)'),
      statusFilter: z
        .enum(['completed', 'in-progress', 'not-started', 'all'])
        .optional()
        .default('all')
        .describe('Filter flows by completion status'),
      includeTaskDetails: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include detailed task information for each flow'),
      includeAnalytics: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include flow analytics, dependencies, and completion data')
    }),
    execute: async (args) => {
      try {
        const { 
          projectRoot, 
          includeSubtasks, 
          sortBy, 
          minUsage, 
          maxResults,
          searchPattern,
          statusFilter,
          includeTaskDetails,
          includeAnalytics
        } = args;
        
        logger.info(`Listing flows with criteria: sort=${sortBy}, minUsage=${minUsage}, status=${statusFilter}, pattern=${searchPattern || 'none'}`);
        
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
        
        // Analyze flows
        const analysis = analyzeFlows(tasksData.tasks, includeSubtasks);
        
        // Filter flows by usage, search pattern, and status
        let filteredFlows = Object.entries(analysis.flowCounts)
          .filter(([flow, count]) => count >= minUsage)
          .filter(([flow]) => !searchPattern || 
            flow.toLowerCase().includes(searchPattern.toLowerCase()))
          .filter(([flow]) => {
            if (statusFilter === 'all') return true;
            const completion = analysis.flowCompletionStatus[flow];
            return completion && completion.status === statusFilter;
          });
        
        // Sort flows
        switch (sortBy) {
          case 'alphabetical':
            filteredFlows.sort(([a], [b]) => a.localeCompare(b));
            break;
          case 'tasks':
            filteredFlows.sort(([a, countA], [b, countB]) => {
              const tasksA = analysis.flowTasks[a]?.length || 0;
              const tasksB = analysis.flowTasks[b]?.length || 0;
              return tasksB - tasksA || a.localeCompare(b);
            });
            break;
          case 'completion':
            filteredFlows.sort(([a], [b]) => {
              const completionA = analysis.flowCompletionStatus[a]?.percentage || 0;
              const completionB = analysis.flowCompletionStatus[b]?.percentage || 0;
              return completionB - completionA || a.localeCompare(b);
            });
            break;
          case 'frequency':
          default:
            filteredFlows.sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
            break;
        }
        
        // Limit results
        const limitedFlows = filteredFlows.slice(0, maxResults);
        
        // Format output
        const output = {
          success: true,
          criteria: {
            includeSubtasks,
            sortBy,
            minUsage,
            maxResults,
            searchPattern: searchPattern || null,
            statusFilter
          },
          summary: {
            totalFlows: analysis.totalFlows,
            filteredFlows: limitedFlows.length,
            totalUsages: analysis.totalUsages,
            averageFlowsPerTask: parseFloat(analysis.averageFlowsPerTask.toFixed(2)),
            tasksWithFlows: analysis.tasksWithFlows,
            tasksWithoutFlows: analysis.tasksWithoutFlows
          },
          flows: limitedFlows.map(([flow, count]) => {
            const completion = analysis.flowCompletionStatus[flow];
            const dependencies = analysis.flowDependencies[flow] || [];
            
            return {
              flow,
              usageCount: count,
              taskCount: analysis.flowTasks[flow]?.length || 0,
              completion: completion || { completed: 0, total: 0, percentage: 0, status: 'not-started' },
              dependencies,
              ...(includeTaskDetails && {
                tasks: analysis.flowTasks[flow] || []
              })
            };
          }),
          ...(includeAnalytics && {
            analytics: {
              topFlows: analysis.topFlows,
              completionOverview: {
                completed: Object.values(analysis.flowCompletionStatus).filter(f => f.status === 'completed').length,
                inProgress: Object.values(analysis.flowCompletionStatus).filter(f => f.status === 'in-progress').length,
                notStarted: Object.values(analysis.flowCompletionStatus).filter(f => f.status === 'not-started').length,
                averageCompletion: parseFloat((Object.values(analysis.flowCompletionStatus)
                  .reduce((sum, f) => sum + f.percentage, 0) / Object.keys(analysis.flowCompletionStatus).length).toFixed(1)) || 0
              },
              flowDependencies: analysis.flowDependencies,
              coverage: {
                tasksWithFlows: analysis.tasksWithFlows,
                totalTasks: tasksData.tasks.length,
                coveragePercentage: parseFloat(((analysis.tasksWithFlows / tasksData.tasks.length) * 100).toFixed(1))
              }
            }
          })
        };
        
        logger.info(`Listed ${limitedFlows.length} flows (${analysis.totalFlows} total, ${filteredFlows.length} after filtering)`);
        
        return createContentResponse(output);
        
      } catch (error) {
        logger.error(`Failed to list flows: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to list flows: ${error.message}`);
      }
    }
  });
}
