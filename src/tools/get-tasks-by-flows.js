import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath,
  getStatusDisplay
} from './utils.js';
import { fuzzyMatchFlows, getMatchedTerms } from './fuzzy-matching-utils.js';
import { processBatchResults } from './batch-processing-utils.js';

/**
 * Get flow distribution analysis
 * @param {Array} allTasks - All tasks in the project
 * @returns {Object} Flow distribution statistics
 */
function getFlowDistribution(allTasks) {
  const flowCounts = {};
  const flowTasks = {};
  
  for (const task of allTasks) {
    if (task.flowNames && Array.isArray(task.flowNames)) {
      for (const flow of task.flowNames) {
        flowCounts[flow] = (flowCounts[flow] || 0) + 1;
        if (!flowTasks[flow]) {
          flowTasks[flow] = [];
        }
        flowTasks[flow].push({
          id: task.id,
          title: task.title,
          status: task.status
        });
      }
    }
    
    // Check subtasks
    if (task.subtasks && Array.isArray(task.subtasks)) {
      for (const subtask of task.subtasks) {
        if (subtask.flowNames && Array.isArray(subtask.flowNames)) {
          for (const flow of subtask.flowNames) {
            flowCounts[flow] = (flowCounts[flow] || 0) + 1;
            if (!flowTasks[flow]) {
              flowTasks[flow] = [];
            }
            flowTasks[flow].push({
              id: `${task.id}.${subtask.id}`,
              title: subtask.title,
              status: subtask.status,
              isSubtask: true,
              parentTaskId: task.id
            });
          }
        }
      }
    }
  }
  
  return {
    totalFlows: Object.keys(flowCounts).length,
    flowCounts,
    flowTasks,
    topFlows: Object.entries(flowCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([flow, count]) => ({ flow, count }))
  };
}

/**
 * Register the get-tasks-by-flows tool
 * @param {Object} server - FastMCP server instance
 */
export function registerGetTasksByFlowsTool(server) {
  server.addTool({
    name: 'get_tasks_by_flows',
    description: 'Find tasks that belong to specified business flows using fuzzy matching. Supports batch processing for large result sets.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      flowNames: z
        .array(z.string())
        .describe('Array of business flow names to search for in task flowNames'),
      minScore: z
        .number()
        .optional()
        .default(0.4)
        .describe('Minimum fuzzy match score (0-1, default: 0.4)'),
      maxResults: z
        .number()
        .optional()
        .default(100)
        .describe('Maximum number of results to return (default: 100)'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in search results'),
      statusFilter: z
        .string()
        .optional()
        .describe('Filter by task status (pending, in-progress, done, completed, blocked, deferred, cancelled)'),
      sortBy: z
        .enum(['score', 'id', 'title'])
        .optional()
        .default('score')
        .describe('Sort results by score, id, or title'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Sort order (ascending or descending)'),
      includeFlowAnalysis: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include flow distribution analysis in results')
    }),
    execute: async (args) => {
      try {
        const { 
          projectRoot, 
          flowNames, 
          minScore, 
          maxResults, 
          includeSubtasks, 
          statusFilter,
          sortBy,
          order,
          includeFlowAnalysis
        } = args;
        
        logger.info(`Searching for tasks by flows: ${flowNames.join(', ')}`);
        
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
        
        const allTasks = tasksData.tasks;
        const searchResults = [];
        
        // Search through tasks
        for (const task of allTasks) {
          // Skip if status filter doesn't match
          if (statusFilter && task.status !== statusFilter) {
            continue;
          }
          
          // Check if task has flowNames field
          if (task.flowNames && Array.isArray(task.flowNames) && task.flowNames.length > 0) {
            const score = fuzzyMatchFlows(flowNames, task.flowNames);
            
            if (score >= minScore) {
              searchResults.push({
                ...task,
                score: parseFloat(score.toFixed(3)),
                matchedFlows: getMatchedTerms(flowNames, task.flowNames)
              });
            }
          }
          
          // Search subtasks if requested
          if (includeSubtasks && task.subtasks && Array.isArray(task.subtasks)) {
            for (const subtask of task.subtasks) {
              // Skip if status filter doesn't match
              if (statusFilter && subtask.status !== statusFilter) {
                continue;
              }
              
              if (subtask.flowNames && Array.isArray(subtask.flowNames) && subtask.flowNames.length > 0) {
                const score = fuzzyMatchFlows(flowNames, subtask.flowNames);
                
                if (score >= minScore) {
                  searchResults.push({
                    ...subtask,
                    id: `${task.id}.${subtask.id}`,
                    parentTaskId: task.id,
                    parentTaskTitle: task.title,
                    isSubtask: true,
                    score: parseFloat(score.toFixed(3)),
                    matchedFlows: getMatchedTerms(flowNames, subtask.flowNames)
                  });
                }
              }
            }
          }
        }
        
        // Process results with batching
        const batchResult = processBatchResults(searchResults, {
          batchSize: 50,
          sortBy,
          order,
          includeSubtasks
        });
        
        // Limit results
        const limitedResults = batchResult.tasks.slice(0, maxResults);
        
        // Get flow analysis if requested
        const flowAnalysis = includeFlowAnalysis ? getFlowDistribution(allTasks) : null;
        
        // Format output
        const output = {
          success: true,
          searchCriteria: {
            flowNames,
            minScore,
            statusFilter: statusFilter || 'all',
            includeSubtasks
          },
          results: {
            totalMatches: batchResult.totalMatches,
            returnedCount: limitedResults.length,
            maxResults,
            tasks: limitedResults.map(task => ({
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority || 'medium',
              flowNames: task.flowNames || [],
              matchedFlows: task.matchedFlows,
              score: task.score,
              ...(task.isSubtask && {
                parentTaskId: task.parentTaskId,
                parentTaskTitle: task.parentTaskTitle,
                isSubtask: true
              }),
              dependencies: task.dependencies || [],
              createdAt: task.createdAt,
              updatedAt: task.updatedAt
            }))
          },
          sorting: {
            sortBy,
            order
          },
          batchInfo: batchResult.useBatching ? {
            useBatching: true,
            totalBatches: batchResult.totalBatches,
            batchSize: batchResult.batchSize
          } : {
            useBatching: false
          },
          ...(flowAnalysis && {
            flowAnalysis: {
              totalFlows: flowAnalysis.totalFlows,
              topFlows: flowAnalysis.topFlows,
              searchedFlowsStatus: flowNames.map(flow => ({
                flow,
                found: Object.keys(flowAnalysis.flowCounts).includes(flow),
                taskCount: flowAnalysis.flowCounts[flow] || 0
              }))
            }
          })
        };
        
        logger.info(`Found ${batchResult.totalMatches} tasks matching flows, returning ${limitedResults.length} results`);
        
        return createContentResponse(output);
        
      } catch (error) {
        logger.error(`Failed to search tasks by flows: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to search tasks by flows: ${error.message}`);
      }
    }
  });
}
