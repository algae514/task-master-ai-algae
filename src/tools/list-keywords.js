import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Analyze keyword distribution and generate statistics
 * @param {Array} allTasks - All tasks in the project
 * @param {boolean} includeSubtasks - Whether to include subtasks in analysis
 * @returns {Object} Keyword analysis data
 */
function analyzeKeywords(allTasks, includeSubtasks = false) {
  const keywordCounts = {};
  const keywordTasks = {};
  const taskKeywordMap = {};
  
  // Process main tasks
  for (const task of allTasks) {
    if (task.keywords && Array.isArray(task.keywords)) {
      taskKeywordMap[task.id] = task.keywords;
      
      for (const keyword of task.keywords) {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
        if (!keywordTasks[keyword]) {
          keywordTasks[keyword] = [];
        }
        keywordTasks[keyword].push({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority || 'medium'
        });
      }
    }
    
    // Process subtasks if requested
    if (includeSubtasks && task.subtasks && Array.isArray(task.subtasks)) {
      for (const subtask of task.subtasks) {
        if (subtask.keywords && Array.isArray(subtask.keywords)) {
          const subtaskId = `${task.id}.${subtask.id}`;
          taskKeywordMap[subtaskId] = subtask.keywords;
          
          for (const keyword of subtask.keywords) {
            keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
            if (!keywordTasks[keyword]) {
              keywordTasks[keyword] = [];
            }
            keywordTasks[keyword].push({
              id: subtaskId,
              title: subtask.title,
              status: subtask.status,
              priority: subtask.priority || 'medium',
              isSubtask: true,
              parentTaskId: task.id,
              parentTaskTitle: task.title
            });
          }
        }
      }
    }
  }
  
  const allKeywords = Object.keys(keywordCounts);
  const topKeywords = Object.entries(keywordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));
  
  // Calculate keyword co-occurrence
  const coOccurrence = {};
  for (const [taskId, keywords] of Object.entries(taskKeywordMap)) {
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const pair = [keywords[i], keywords[j]].sort().join(' + ');
        coOccurrence[pair] = (coOccurrence[pair] || 0) + 1;
      }
    }
  }
  
  const topCoOccurrences = Object.entries(coOccurrence)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([pair, count]) => ({ keywords: pair, count }));
  
  return {
    totalKeywords: allKeywords.length,
    totalUsages: Object.values(keywordCounts).reduce((sum, count) => sum + count, 0),
    averageKeywordsPerTask: Object.keys(taskKeywordMap).length > 0 ? 
      Object.values(taskKeywordMap).reduce((sum, keywords) => sum + keywords.length, 0) / Object.keys(taskKeywordMap).length : 0,
    keywordCounts,
    keywordTasks,
    topKeywords,
    topCoOccurrences,
    allKeywords: allKeywords.sort(),
    tasksWithKeywords: Object.keys(taskKeywordMap).length,
    tasksWithoutKeywords: allTasks.length - Object.keys(taskKeywordMap).filter(id => !id.includes('.')).length
  };
}

/**
 * Register the list-keywords tool
 * @param {Object} server - FastMCP server instance
 */
export function registerListKeywordsTool(server) {
  server.addTool({
    name: 'list_keywords',
    description: 'List all keywords used across tasks with usage statistics, co-occurrence analysis, and filtering options.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in keyword analysis'),
      sortBy: z
        .enum(['frequency', 'alphabetical', 'tasks'])
        .optional()
        .default('frequency')
        .describe('Sort keywords by frequency, alphabetical order, or number of tasks'),
      minUsage: z
        .number()
        .optional()
        .default(1)
        .describe('Minimum usage count to include keyword (default: 1)'),
      maxResults: z
        .number()
        .optional()
        .default(100)
        .describe('Maximum number of keywords to return (default: 100)'),
      searchPattern: z
        .string()
        .optional()
        .describe('Filter keywords by pattern (case-insensitive substring match)'),
      includeTaskDetails: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include detailed task information for each keyword'),
      includeAnalytics: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include keyword analytics and co-occurrence data')
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
          includeTaskDetails,
          includeAnalytics
        } = args;
        
        logger.info(`Listing keywords with criteria: sort=${sortBy}, minUsage=${minUsage}, pattern=${searchPattern || 'none'}`);
        
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
        
        // Analyze keywords
        const analysis = analyzeKeywords(tasksData.tasks, includeSubtasks);
        
        // Filter keywords by usage and search pattern
        let filteredKeywords = Object.entries(analysis.keywordCounts)
          .filter(([keyword, count]) => count >= minUsage)
          .filter(([keyword]) => !searchPattern || 
            keyword.toLowerCase().includes(searchPattern.toLowerCase()));
        
        // Sort keywords
        switch (sortBy) {
          case 'alphabetical':
            filteredKeywords.sort(([a], [b]) => a.localeCompare(b));
            break;
          case 'tasks':
            filteredKeywords.sort(([a, countA], [b, countB]) => {
              const tasksA = analysis.keywordTasks[a]?.length || 0;
              const tasksB = analysis.keywordTasks[b]?.length || 0;
              return tasksB - tasksA || a.localeCompare(b);
            });
            break;
          case 'frequency':
          default:
            filteredKeywords.sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
            break;
        }
        
        // Limit results
        const limitedKeywords = filteredKeywords.slice(0, maxResults);
        
        // Format output
        const output = {
          success: true,
          criteria: {
            includeSubtasks,
            sortBy,
            minUsage,
            maxResults,
            searchPattern: searchPattern || null
          },
          summary: {
            totalKeywords: analysis.totalKeywords,
            filteredKeywords: limitedKeywords.length,
            totalUsages: analysis.totalUsages,
            averageKeywordsPerTask: parseFloat(analysis.averageKeywordsPerTask.toFixed(2)),
            tasksWithKeywords: analysis.tasksWithKeywords,
            tasksWithoutKeywords: analysis.tasksWithoutKeywords
          },
          keywords: limitedKeywords.map(([keyword, count]) => ({
            keyword,
            usageCount: count,
            taskCount: analysis.keywordTasks[keyword]?.length || 0,
            ...(includeTaskDetails && {
              tasks: analysis.keywordTasks[keyword] || []
            })
          })),
          ...(includeAnalytics && {
            analytics: {
              topKeywords: analysis.topKeywords,
              topCoOccurrences: analysis.topCoOccurrences,
              coverage: {
                tasksWithKeywords: analysis.tasksWithKeywords,
                totalTasks: tasksData.tasks.length,
                coveragePercentage: parseFloat(((analysis.tasksWithKeywords / tasksData.tasks.length) * 100).toFixed(1))
              }
            }
          })
        };
        
        logger.info(`Listed ${limitedKeywords.length} keywords (${analysis.totalKeywords} total, ${filteredKeywords.length} after filtering)`);
        
        return createContentResponse(output);
        
      } catch (error) {
        logger.error(`Failed to list keywords: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to list keywords: ${error.message}`);
      }
    }
  });
}
