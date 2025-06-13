import { registerInitTool } from './init.js';
import { registerListTasksTool } from './list-tasks.js';
import { registerSetTaskStatusTool } from './set-task-status.js';
import { registerGenerateTaskFilesTool } from './generate-task-files.js';
import { registerShowTaskTool } from './show-task.js';
import { registerNextTaskTool } from './next-task.js';
import { registerAddSubtaskTool } from './add-subtask.js';
import { registerRemoveSubtaskTool } from './remove-subtask.js';
import { registerClearSubtasksTool } from './clear-subtasks.js';
import { registerAddDependencyTool } from './add-dependency.js';
import { registerRemoveDependencyTool } from './remove-dependency.js';
import { registerValidateDependenciesTool } from './validate-dependencies.js';
import { registerFixDependenciesTool } from './fix-dependencies.js';
import { registerRemoveTaskTool } from './remove-task.js';
import { registerMoveTaskTool } from './move-task.js';
import { registerComplexityReportTool } from './complexity-report.js';
import { registerParsePRDTool } from './parse-prd.js';
import { registerEnhancedParsePRDTool } from './parse-prd-enhanced.js';
import { registerUpdateTasksTool } from './update-tasks.js';
import { registerGetTasksByKeywordsTool } from './get-tasks-by-keywords.js';
import { registerGetTasksByFlowsTool } from './get-tasks-by-flows.js';
import { registerUpdateTasksByKeywordsTool } from './update-tasks-by-keywords.js';
import { registerUpdateTasksByFlowsTool } from './update-tasks-by-flows.js';
import { registerListKeywordsTool } from './list-keywords.js';
import { registerListFlowsTool } from './list-flows.js';
import { registerExpandTaskTool } from './expand-task.js';
import { registerAnalyzeTaskComplexityTool } from './analyze-task-complexity.js';
import { registerUpdateTaskByIdTool } from './update-task-by-id.js';
import { registerUpdateSubtaskByIdTool } from './update-subtask-by-id.js';
import { registerAddTaskTool } from './add-task.js';
import logger from '../logger.js';

/**
 * Register all Task Master tools with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerTaskMasterTools(server) {
  try {
    // Core initialization
    registerInitTool(server);
    
    // PRD and AI-guided tools
    registerEnhancedParsePRDTool(server); // Enhanced version with keywords and flowNames
    registerUpdateTasksTool(server);
    
    // Keywords and Flow Names tools
    registerGetTasksByKeywordsTool(server);
    registerGetTasksByFlowsTool(server);
    registerUpdateTasksByKeywordsTool(server);
    registerUpdateTasksByFlowsTool(server);
    registerListKeywordsTool(server);
    registerListFlowsTool(server);
    registerExpandTaskTool(server);
    registerAnalyzeTaskComplexityTool(server);
    registerUpdateTaskByIdTool(server);
    registerUpdateSubtaskByIdTool(server);
    registerAddTaskTool(server);
    
    // Task listing and viewing
    registerListTasksTool(server);
    registerShowTaskTool(server);
    registerNextTaskTool(server);
    
    // Task status management
    registerSetTaskStatusTool(server);
    
    // File generation
    registerGenerateTaskFilesTool(server);
    
    // Subtask management
    registerAddSubtaskTool(server);
    registerRemoveSubtaskTool(server);
    registerClearSubtasksTool(server);
    
    // Dependency management
    registerAddDependencyTool(server);
    registerRemoveDependencyTool(server);
    registerValidateDependenciesTool(server);
    registerFixDependenciesTool(server);
    
    // Task management
    registerRemoveTaskTool(server);
    registerMoveTaskTool(server);
    
    // Reports and configuration
    registerComplexityReportTool(server);
    
    logger.info('Task Master tools registered successfully');
  } catch (error) {
    logger.error(`Error registering Task Master tools: ${error.message}`, { error: error.stack });
    throw error;
  }
}

export default {
  registerTaskMasterTools
};
