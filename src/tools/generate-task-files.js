import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  readJSON,
  getTasksFilePath,
  ensureDirectoryExists
} from './utils.js';

/**
 * Generate individual task files from tasks.json
 * @param {string} tasksPath - Path to tasks.json
 * @param {string} outputDir - Output directory for task files
 * @returns {Object} Result with generated files info
 */
function generateTaskFiles(tasksPath, outputDir) {
  const data = readJSON(tasksPath);
  
  if (!data || !data.tasks) {
    throw new Error(`No valid tasks found in ${tasksPath}`);
  }
  
  // Ensure output directory exists
  ensureDirectoryExists(outputDir);
  
  const generatedFiles = [];
  const errors = [];
  
  data.tasks.forEach(task => {
    try {
      // Generate filename: task_001.txt, task_002.txt, etc.
      const filename = `task_${String(task.id).padStart(3, '0')}.txt`;
      const filePath = path.join(outputDir, filename);
      
      // Generate file content
      let content = `# Task ${task.id}: ${task.title}\
\
`;
      content += `**Status:** ${task.status || 'pending'}\
`;
      content += `**Priority:** ${task.priority || 'medium'}\
\
`;
      
      if (task.dependencies && task.dependencies.length > 0) {
        content += `**Dependencies:** ${task.dependencies.join(', ')}\
\
`;
      }
      
      if (task.description) {
        content += `## Description\
\
${task.description}\
\
`;
      }
      
      if (task.details) {
        content += `## Implementation Details\
\
${task.details}\
\
`;
      }
      
      // Add subtasks if any
      if (task.subtasks && task.subtasks.length > 0) {
        content += `## Subtasks\
\
`;
        task.subtasks.forEach(subtask => {
          const statusIcon = {
            'done': '✅',
            'completed': '✅',
            'in-progress': '🔄',
            'pending': '⏳',
            'blocked': '🚫',
            'deferred': '⏸️',
            'cancelled': '❌'
          }[subtask.status] || '❓';
          
          content += `- ${statusIcon} **${task.id}.${subtask.id}:** ${subtask.title}\
`;
          if (subtask.description) {
            content += `  - ${subtask.description}\
`;
          }
        });
        content += '\
';
      }
      
      if (task.testStrategy) {
        content += `## Test Strategy\
\
${task.testStrategy}\
\
`;
      }
      
      content += `---\
\
*Generated on: ${new Date().toISOString()}*\
`;
      
      // Write file
      fs.writeFileSync(filePath, content);
      generatedFiles.push({
        filename,
        path: filePath,
        taskId: task.id,
        title: task.title
      });
      
    } catch (error) {
      errors.push({
        taskId: task.id,
        error: error.message
      });
    }
  });
  
  return {
    generatedFiles,
    errors,
    outputDirectory: outputDir,
    totalTasks: data.tasks.length
  };
}

/**
 * Register the generate-task-files tool
 * @param {Object} server - FastMCP server instance
 */
export function registerGenerateTaskFilesTool(server) {
  server.addTool({
    name: 'generate_task_files',
    description: 'Generate individual task files from tasks.json. Creates separate .txt files for each task with all details, subtasks, and formatting.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      outputDir: z
        .string()
        .optional()
        .describe('Output directory for task files. Defaults to .taskmaster/tasks/')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, outputDir } = args;
        
        logger.info(`Generating task files for project: ${projectRoot}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const outputDirectory = outputDir || path.join(projectRoot, '.taskmaster', 'tasks');
        
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found at ${tasksPath}. Run init first to create the project structure.`);
        }
        
        const result = generateTaskFiles(tasksPath, outputDirectory);
        
        const response = {
          success: true,
          summary: {
            totalTasks: result.totalTasks,
            generatedFiles: result.generatedFiles.length,
            errors: result.errors.length,
            outputDirectory: result.outputDirectory
          },
          files: result.generatedFiles,
          errors: result.errors.length > 0 ? result.errors : undefined
        };
        
        logger.info(`Generated ${result.generatedFiles.length} task files in ${result.outputDirectory}`);
        
        return createContentResponse(response);
      } catch (error) {
        logger.error(`Failed to generate task files: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to generate task files: ${error.message}`);
      }
    }
  });
}
