/**
 * Generate CSV data for basic status report
 * @param {Array} reportRows - Array of report row objects
 * @returns {string} CSV formatted string
 */
function generateBasicStatusCSV(reportRows) {
  const headers = [
    'Task ID',
    'Title',
    'Status', 
    'Complexity',
    'Dependencies',
    'Subtasks',
    'Deps Count',
    'All Deps Done',
    'Relevant Count',
    'All Relevant Done'
  ];
  
  const csvRows = [headers.join(',')];
  
  reportRows.forEach(row => {
    const csvRow = [
      row.taskId,
      `"${row.title.replace(/"/g, '""')}"`, // Escape quotes in title
      row.status,
      row.complexity,
      row.dependencies.length > 0 ? `"[${row.dependencies.join(', ')}]"` : '[]',
      row.numSubtasks,
      row.numDependencies,
      row.allDepsCompleted ? 'Yes' : 'No',
      row.numRelevantTasks,
      row.allRelevantCompleted ? 'Yes' : 'No'
    ];
    csvRows.push(csvRow.join(','));
  });
  
  return csvRows.join('\n');
}

/**
 * Generate CSV data for detailed status report
 * @param {Array} detailedReport - Array of detailed task objects
 * @returns {string} CSV formatted string
 */
function generateDetailedStatusCSV(detailedReport) {
  const headers = [
    'Task ID',
    'Title',
    'Description',
    'Status',
    'Complexity',
    'Dependencies',
    'Flows',
    'Keywords',
    'Relevant Tasks',
    'All Deps Done',
    'All Relevant Done',
    'Priority',
    'Subtasks Count'
  ];
  
  const csvRows = [headers.join(',')];
  
  detailedReport.forEach(task => {
    const csvRow = [
      task.taskId,
      `"${task.title.replace(/"/g, '""')}"`,
      `"${(task.description || '').replace(/"/g, '""').substring(0, 100)}..."`, // Truncate description
      task.status,
      task.complexity,
      task.dependencies.length > 0 ? `"[${task.dependencies.join(', ')}]"` : '[]',
      task.flows.length > 0 ? `"[${task.flows.join(', ')}]"` : '[]',
      task.keywords.length > 0 ? `"[${task.keywords.join(', ')}]"` : '[]',
      task.relevantTasks.length > 0 ? `"[${task.relevantTasks.join(', ')}]"` : '[]',
      task.allDepsCompleted ? 'Yes' : 'No',
      task.allRelevantCompleted ? 'Yes' : 'No',
      task.priority || 'medium',
      task.subtasks.length
    ];
    csvRows.push(csvRow.join(','));
    
    // Add subtasks as separate rows
    task.subtasks.forEach(subtask => {
      const subtaskRow = [
        subtask.subtaskId,
        `"  └─ ${subtask.title.replace(/"/g, '""')}"`,
        `"${(subtask.description || '').replace(/"/g, '""').substring(0, 80)}..."`,
        subtask.status,
        'N/A',
        subtask.dependencies.length > 0 ? `"[${subtask.dependencies.join(', ')}]"` : '[]',
        '[]',
        '[]',
        '[]',
        subtask.allDepsCompleted ? 'Yes' : 'No',
        'Yes',
        'N/A',
        '0'
      ];
      csvRows.push(subtaskRow.join(','));
    });
  });
  
  return csvRows.join('\n');
}

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath,
  readJSON
} from './utils.js';

/**
 * Check if all dependencies are completed
 * @param {Array} dependencies - Array of dependency IDs
 * @param {Array} allTasks - All tasks in the project
 * @returns {boolean} True if all dependencies are completed
 */
function areAllDependenciesCompleted(dependencies, allTasks) {
  if (!dependencies || dependencies.length === 0) return true;
  
  return dependencies.every(depId => {
    // Handle subtask dependencies (format: "parentId.subtaskId")
    if (typeof depId === 'string' && depId.includes('.')) {
      const [parentId, subtaskId] = depId.split('.');
      const parentTask = allTasks.find(t => t.id === parseInt(parentId));
      if (!parentTask || !parentTask.subtasks) return false;
      const subtask = parentTask.subtasks.find(st => st.id === parseInt(subtaskId));
      return subtask && (subtask.status === 'completed' || subtask.status === 'done');
    }
    
    // Handle regular task dependencies
    const depTask = allTasks.find(t => t.id === depId);
    return depTask && (depTask.status === 'completed' || depTask.status === 'done');
  });
}

/**
 * Check if all relevant tasks are completed
 * @param {Array} relevantTasks - Array of relevant task IDs
 * @param {Array} allTasks - All tasks in the project
 * @returns {boolean} True if all relevant tasks are completed
 */
function areAllRelevantTasksCompleted(relevantTasks, allTasks) {
  if (!relevantTasks || relevantTasks.length === 0) return true;
  
  return relevantTasks.every(taskId => {
    const task = allTasks.find(t => t.id === taskId);
    return task && (task.status === 'completed' || task.status === 'done');
  });
}

/**
 * Get complexity from complexity report
 * @param {number} taskId - Task ID
 * @param {string} projectRoot - Project root directory
 * @returns {string} Complexity level or 'N/A'
 */
function getTaskComplexity(taskId, projectRoot) {
  try {
    const complexityReportPath = path.join(projectRoot, '.taskmaster', 'complexity-report.json');
    if (!fs.existsSync(complexityReportPath)) return 'N/A';
    
    const complexityReport = JSON.parse(fs.readFileSync(complexityReportPath, 'utf8'));
    const analysis = complexityReport?.complexityAnalysis?.find(a => a.taskId === taskId);
    return analysis?.complexity || 'N/A';
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Register the status-report-to-user tool
 * @param {Object} server - FastMCP server instance
 */
export function registerStatusReportTool(server) {
  server.addTool({
    name: 'status_report_to_user',
    description: 'Generate a simple status report showing basic task information in a BARE MINIMUM table format. Returns pre-formatted CSV data that should be displayed as a simple text table to the user (NO HTML/graphs). Use this when user asks for project status or current status.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      statusFilter: z
        .string()
        .optional()
        .describe('Filter tasks by status (pending, in-progress, done, completed, blocked, deferred, cancelled). Use "all" for no filter.'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in the report (default: false)')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, statusFilter, includeSubtasks } = args;
        
        logger.info(`Generating status report for project in ${projectRoot}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found: ${tasksPath}. Run init first to create the project structure.`);
        }
        
        const data = readJSON(tasksPath);
        if (!data || !data.tasks) {
          return createErrorResponse(`Invalid tasks data in ${tasksPath}`);
        }
        
        // Filter tasks by status if specified
        let tasks = data.tasks;
        if (statusFilter && statusFilter !== 'all') {
          tasks = tasks.filter(task => task.status === statusFilter);
        }
        
        const reportRows = [];
        
        // Process main tasks
        tasks.forEach(task => {
          const complexity = getTaskComplexity(task.id, projectRoot);
          const numSubtasks = task.subtasks ? task.subtasks.length : 0;
          const numDependencies = task.dependencies ? task.dependencies.length : 0;
          const allDepsCompleted = areAllDependenciesCompleted(task.dependencies, data.tasks);
          const numRelevantTasks = task.relevantTasks ? task.relevantTasks.length : 0;
          const allRelevantCompleted = areAllRelevantTasksCompleted(task.relevantTasks, data.tasks);
          
          reportRows.push({
            taskId: task.id,
            title: task.title,
            status: task.status,
            complexity: complexity,
            dependencies: task.dependencies || [],
            numSubtasks: numSubtasks,
            numDependencies: numDependencies,
            allDepsCompleted: allDepsCompleted,
            numRelevantTasks: numRelevantTasks,
            allRelevantCompleted: allRelevantCompleted,
            type: 'task'
          });
          
          // Add subtasks if requested
          if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
              if (!statusFilter || statusFilter === 'all' || subtask.status === statusFilter) {
                const subtaskNumDeps = subtask.dependencies ? subtask.dependencies.length : 0;
                const subtaskAllDepsCompleted = areAllDependenciesCompleted(subtask.dependencies, data.tasks);
                
                reportRows.push({
                  taskId: `${task.id}.${subtask.id}`,
                  title: `  └─ ${subtask.title}`,
                  status: subtask.status,
                  complexity: 'N/A',
                  dependencies: subtask.dependencies || [],
                  numSubtasks: 0,
                  numDependencies: subtaskNumDeps,
                  allDepsCompleted: subtaskAllDepsCompleted,
                  numRelevantTasks: 0,
                  allRelevantCompleted: true,
                  type: 'subtask'
                });
              }
            });
          }
        });
        
        // Calculate summary statistics
        const totalTasks = reportRows.filter(row => row.type === 'task').length;
        const totalSubtasks = reportRows.filter(row => row.type === 'subtask').length;
        const completedTasks = reportRows.filter(row => 
          row.type === 'task' && (row.status === 'completed' || row.status === 'done')
        ).length;
        const inProgressTasks = reportRows.filter(row => 
          row.type === 'task' && row.status === 'in-progress'
        ).length;
        const pendingTasks = reportRows.filter(row => 
          row.type === 'task' && row.status === 'pending'
        ).length;
        
        const result = {
          success: true,
          reportType: 'basic_status',
          summary: {
            totalTasks,
            totalSubtasks,
            completedTasks,
            inProgressTasks,
            pendingTasks,
            completionPercentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
          },
          // CSV format for efficient LLM processing
          csvData: generateBasicStatusCSV(reportRows),
          // Instructions for LLM
          displayInstructions: "Present this data as a BARE MINIMUM simple text table. Use the csvData field to create a basic formatted table for the user. Do NOT create HTML, graphs, or fancy formatting. Just a simple, clean text table. Do not process the raw tasks array - use the pre-formatted CSV data.",
          tasks: reportRows,
          generatedAt: new Date().toISOString(),
          filters: {
            statusFilter: statusFilter || 'all',
            includeSubtasks
          }
        };
        
        logger.info(`Generated status report with ${reportRows.length} entries`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to generate status report: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to generate status report: ${error.message}`);
      }
    }
  });
}

/**
 * Register the get-full-status-report tool
 * @param {Object} server - FastMCP server instance
 */
export function registerFullStatusReportTool(server) {
  server.addTool({
    name: 'get_full_status_report',
    description: 'Generate a comprehensive detailed status report with full task information including descriptions, flows, keywords, and relevant tasks. Returns pre-formatted CSV data that should be displayed as a BARE MINIMUM simple text table to the user (NO HTML/graphs/charts). Use this when user asks for detailed report or more details.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      statusFilter: z
        .string()
        .optional()
        .describe('Filter tasks by status (pending, in-progress, done, completed, blocked, deferred, cancelled). Use "all" for no filter.'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include subtasks in the detailed report (default: true)')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, statusFilter, includeSubtasks } = args;
        
        logger.info(`Generating full status report for project in ${projectRoot}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found: ${tasksPath}. Run init first to create the project structure.`);
        }
        
        const data = readJSON(tasksPath);
        if (!data || !data.tasks) {
          return createErrorResponse(`Invalid tasks data in ${tasksPath}`);
        }
        
        // Filter tasks by status if specified
        let tasks = data.tasks;
        if (statusFilter && statusFilter !== 'all') {
          tasks = tasks.filter(task => task.status === statusFilter);
        }
        
        const detailedReport = [];
        
        // Process main tasks with full details
        tasks.forEach(task => {
          const complexity = getTaskComplexity(task.id, projectRoot);
          const allDepsCompleted = areAllDependenciesCompleted(task.dependencies, data.tasks);
          const allRelevantCompleted = areAllRelevantTasksCompleted(task.relevantTasks, data.tasks);
          
          const taskDetail = {
            taskId: task.id,
            title: task.title,
            description: task.description || '',
            status: task.status,
            complexity: complexity,
            dependencies: task.dependencies || [],
            flows: task.flowNames || [],
            keywords: task.keywords || [],
            relevantTasks: task.relevantTasks || [],
            allDepsCompleted: allDepsCompleted,
            allRelevantCompleted: allRelevantCompleted,
            details: task.details || '',
            priority: task.priority || 'medium',
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            type: 'task',
            subtasks: []
          };
          
          // Add subtasks with full details if requested
          if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
              if (!statusFilter || statusFilter === 'all' || subtask.status === statusFilter) {
                const subtaskAllDepsCompleted = areAllDependenciesCompleted(subtask.dependencies, data.tasks);
                
                taskDetail.subtasks.push({
                  subtaskId: `${task.id}.${subtask.id}`,
                  title: subtask.title,
                  description: subtask.description || '',
                  status: subtask.status,
                  dependencies: subtask.dependencies || [],
                  allDepsCompleted: subtaskAllDepsCompleted,
                  details: subtask.details || '',
                  createdAt: subtask.createdAt,
                  updatedAt: subtask.updatedAt
                });
              }
            });
          }
          
          detailedReport.push(taskDetail);
        });
        
        // Calculate comprehensive statistics
        const totalTasks = detailedReport.length;
        const totalSubtasks = detailedReport.reduce((sum, task) => sum + task.subtasks.length, 0);
        
        const statusCounts = {
          pending: 0,
          'in-progress': 0,
          done: 0,
          completed: 0,
          blocked: 0,
          deferred: 0,
          cancelled: 0
        };
        
        const complexityCounts = {
          low: 0,
          medium: 0,
          high: 0,
          'very-high': 0,
          'N/A': 0
        };
        
        detailedReport.forEach(task => {
          if (statusCounts.hasOwnProperty(task.status)) {
            statusCounts[task.status]++;
          }
          if (complexityCounts.hasOwnProperty(task.complexity)) {
            complexityCounts[task.complexity]++;
          }
        });
        
        // Collect all flows and keywords
        const allFlows = [...new Set(detailedReport.flatMap(task => task.flows))];
        const allKeywords = [...new Set(detailedReport.flatMap(task => task.keywords))];
        
        const result = {
          success: true,
          reportType: 'full_detailed_status',
          summary: {
            totalTasks,
            totalSubtasks,
            statusBreakdown: statusCounts,
            complexityBreakdown: complexityCounts,
            completionPercentage: totalTasks > 0 ? 
              Math.round(((statusCounts.completed + statusCounts.done) / totalTasks) * 100) : 0,
            totalFlows: allFlows.length,
            totalKeywords: allKeywords.length
          },
          metadata: {
            allFlows,
            allKeywords,
            tasksWithBlockedDependencies: detailedReport.filter(task => !task.allDepsCompleted).length,
            tasksWithIncompleteRelevant: detailedReport.filter(task => !task.allRelevantCompleted).length
          },
          // CSV format for efficient LLM processing
          csvData: generateDetailedStatusCSV(detailedReport),
          // Instructions for LLM
          displayInstructions: "Present this data as a BARE MINIMUM simple text table. Use the csvData field to create a basic formatted table for the user. Do NOT create HTML, graphs, charts, or fancy formatting. Just a simple, clean text table with the summary above it. Do not process the raw tasks array - use the pre-formatted CSV data.",
          tasks: detailedReport,
          generatedAt: new Date().toISOString(),
          filters: {
            statusFilter: statusFilter || 'all',
            includeSubtasks
          }
        };
        
        logger.info(`Generated full status report with ${totalTasks} tasks and ${totalSubtasks} subtasks`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to generate full status report: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to generate full status report: ${error.message}`);
      }
    }
  });
}
