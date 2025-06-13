import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath,
  getStatusDisplay
} from './utils.js';
import { fuzzyMatchKeywords, getMatchedTerms } from './fuzzy-matching-utils.js';
import { processBatchResults } from './batch-processing-utils.js';

/**
 * Register the get-tasks-by-keywords tool
 * @param {Object} server - FastMCP server instance
 */
export function registerGetTasksByKeywordsTool(server) {
  server.addTool({
    name: 'get_tasks_by_keywords',
    description: 'Find tasks that match specified keywords using fuzzy matching. Supports batch processing for large result sets.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      keywords: z
        .array(z.string())
        .describe('Array of keywords to search for in task keywords'),
      minScore: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum fuzzy match score (0-1, default: 0.3)'),
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
        .describe('Sort order (ascending or descending)')
    }),
    execute: async (args) => {
      try {
        const { 
          projectRoot, 
          keywords, 
          minScore, 
          maxResults, 
          includeSubtasks, 
          statusFilter,
          sortBy,
          order
        } = args;
        
        logger.info(`Searching for tasks by keywords: ${keywords.join(', ')}`);
        
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
          
          // Check if task has keywords field
          if (task.keywords && Array.isArray(task.keywords) && task.keywords.length > 0) {
            const score = fuzzyMatchKeywords(keywords, task.keywords);
            
            if (score >= minScore) {
              searchResults.push({
                ...task,
                score: parseFloat(score.toFixed(3)),
                matchedKeywords: getMatchedTerms(keywords, task.keywords)
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
              
              if (subtask.keywords && Array.isArray(subtask.keywords) && subtask.keywords.length > 0) {
                const score = fuzzyMatchKeywords(keywords, subtask.keywords);
                
                if (score >= minScore) {
                  searchResults.push({
                    ...subtask,
                    id: `${task.id}.${subtask.id}`,
                    parentTaskId: task.id,
                    parentTaskTitle: task.title,
                    isSubtask: true,
                    score: parseFloat(score.toFixed(3)),
                    matchedKeywords: getMatchedTerms(keywords, subtask.keywords)
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
        
        // Format output
        const output = {
          success: true,
          searchCriteria: {
            keywords,
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
              keywords: task.keywords || [],
              matchedKeywords: task.matchedKeywords,
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
          }
        };
        
        logger.info(`Found ${batchResult.totalMatches} tasks matching keywords, returning ${limitedResults.length} results`);
        
        return createContentResponse(output);
        
      } catch (error) {
        logger.error(`Failed to search tasks by keywords: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to search tasks by keywords: ${error.message}`);
      }
    }
  });
}
