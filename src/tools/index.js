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
    registerParsePRDTool(server);
    
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
