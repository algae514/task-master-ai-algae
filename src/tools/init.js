import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';

/**
 * Creates standard content response for tools
 * @param {string|Object} content - Content to include in response
 * @returns {Object} - Content response object in FastMCP format
 */
function createContentResponse(content) {
  return {
    content: [
      {
        type: 'text',
        text: typeof content === 'object'
          ? JSON.stringify(content, null, 2)
          : String(content)
      }
    ]
  };
}

/**
 * Creates error response for tools
 * @param {string} errorMessage - Error message to include in response
 * @returns {Object} - Error content response object in FastMCP format
 */
function createErrorResponse(errorMessage) {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${errorMessage}`
      }
    ],
    isError: true
  };
}

/**
 * Create directory if it doesn't exist
 * @param {string} dirPath - Directory path to create
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created directory: ${dirPath}`);
  }
}

/**
 * Copy content to a file, handling existing files appropriately
 * @param {string} content - Content to write
 * @param {string} targetPath - Target file path
 * @param {boolean} overwrite - Whether to overwrite existing files
 */
function writeTemplateFile(content, targetPath, overwrite = false) {
  if (fs.existsSync(targetPath) && !overwrite) {
    logger.info(`File already exists, skipping: ${targetPath}`);
    return false;
  }

  fs.writeFileSync(targetPath, content);
  logger.info(`Created file: ${targetPath}`);
  return true;
}

/**
 * Create the basic .taskmaster project structure
 * @param {string} projectRoot - Root directory for the project
 * @returns {Object} - Summary of created files and directories
 */
function createProjectStructure(projectRoot) {
  const createdFiles = [];
  const createdDirs = [];

  logger.info(`Creating Task Master project structure in: ${projectRoot}`);

  const dirs = [
    '.taskmaster',
    '.taskmaster/tasks',
    '.taskmaster/docs',
    '.taskmaster/reports',
    '.taskmaster/templates',
    '.roo',
    '.roo/rules-architect',
    '.roo/rules-ask',
    '.roo/rules-boomerang',
    '.roo/rules-code',
    '.roo/rules-debug',
    '.roo/rules-test'
  ];

  dirs.forEach(dir => {
    const dirPath = path.join(projectRoot, dir);
    ensureDirectoryExists(dirPath);
    createdDirs.push(dir);
  });

  const config = {
    global: {
      logLevel: 'info',
      debug: false,
      defaultSubtasks: 5,
      defaultPriority: 'medium',
      projectName: 'Task Master Project',
      projectRoot: projectRoot
    },
    version: '0.1.0',
    createdAt: new Date().toISOString()
  };

  const configPath = path.join(projectRoot, '.taskmaster/config.json');
  if (writeTemplateFile(JSON.stringify(config, null, 2), configPath)) {
    createdFiles.push('.taskmaster/config.json');
  }

  const roomodes = {
    customModes: [
      {
        slug: 'boomerang',
        name: 'Boomerang',
        roleDefinition: 'You are Roo, a strategic workflow orchestrator who coordinates complex tasks by delegating them to appropriate specialized modes.',
        customInstructions: 'Your role is to coordinate complex workflows by delegating tasks to specialized modes.',
        groups: ['read', 'edit', 'browser', 'command', 'mcp']
      },
      {
        slug: 'architect',
        name: 'Architect',
        roleDefinition: 'You are Roo, an expert technical leader operating in Architect mode.',
        customInstructions: 'Focus on analyzing requirements, designing system architecture, and planning implementation steps.',
        groups: ['read', ['edit', { fileRegex: '\\.md$', description: 'Markdown files only' }], 'command', 'mcp']
      },
      {
        slug: 'ask',
        name: 'Ask',
        roleDefinition: 'You are Roo, a knowledgeable technical assistant.',
        customInstructions: 'You can analyze code, explain concepts, and access external resources.',
        groups: ['read', 'browser', 'mcp']
      },
      {
        slug: 'debug',
        name: 'Debug',
        roleDefinition: 'You are Roo, an expert software debugger specializing in systematic problem diagnosis and resolution.',
        customInstructions: 'Reflect on possible sources of the problem, add logs to validate assumptions.',
        groups: ['read', 'edit', 'command', 'mcp']
      },
      {
        slug: 'test',
        name: 'Test',
        roleDefinition: 'You are Roo, an expert software tester.',
        customInstructions: 'Focus on developing and executing test plans, report results clearly.',
        groups: ['read', 'command', 'mcp']
      },
      {
        slug: 'code',
        name: 'Code',
        roleDefinition: 'You are Roo, an expert software developer.',
        customInstructions: 'Focus on implementing solutions, writing clean code, and following best practices.',
        groups: ['read', 'edit', 'command', 'mcp']
      }
    ]
  };

  const roomodesPath = path.join(projectRoot, '.roomodes');
  if (writeTemplateFile(JSON.stringify(roomodes, null, 2), roomodesPath)) {
    createdFiles.push('.roomodes');
  }

  const rooModes = ['architect', 'ask', 'boomerang', 'code', 'debug', 'test'];
  rooModes.forEach(mode => {
    const ruleContent = `# ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode Rules

This is the ${mode} mode for Roo Code integration.

## Purpose

This mode is designed for ${mode}-specific tasks within the Task Master workflow.

## Guidelines

- Focus on ${mode}-related activities
- Coordinate with other modes through the boomerang orchestrator
- Use Task Master tools for task management

## Created by Task Master AI Algae
Generated on: ${new Date().toISOString()}
`;
    const rulePath = path.join(projectRoot, `.roo/rules-${mode}/${mode}-rules`);
    if (writeTemplateFile(ruleContent, rulePath)) {
      createdFiles.push(`.roo/rules-${mode}/${mode}-rules`);
    }
  });

  const examplePrd = `# Project Requirements Document (PRD) Template

## Project Overview

### Project Name
[Your project name here]

### Description
[Brief description of what this project does]

### Goals
- [Goal 1]
- [Goal 2]
- [Goal 3]

## Requirements

### Functional Requirements
1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

### Technical Requirements
- [Technical requirement 1]
- [Technical requirement 2]

### Non-Functional Requirements
- Performance: [Performance requirements]
- Security: [Security requirements]
- Scalability: [Scalability requirements]

## Implementation Notes

[Any specific implementation notes or constraints]

## Success Criteria

- [Success criteria 1]
- [Success criteria 2]

---

*This PRD template was created by Task Master AI Algae*
*Generated on: ${new Date().toISOString()}*
`;
  const prdPath = path.join(projectRoot, '.taskmaster/templates/example_prd.txt');
  if (writeTemplateFile(examplePrd, prdPath)) {
    createdFiles.push('.taskmaster/templates/example_prd.txt');
  }

  const tasksData = {
    tasks: [],
    metadata: {
      version: '0.1.0',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }
  };

  const tasksPath = path.join(projectRoot, '.taskmaster/tasks/tasks.json');
  if (writeTemplateFile(JSON.stringify(tasksData, null, 2), tasksPath)) {
    createdFiles.push('.taskmaster/tasks/tasks.json');
  }

  const gitignoreAdditions = `
# Task Master AI Algae
.taskmaster/reports/
node_modules/
.env
*.log
logs/
`;

  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const existingContent = fs.readFileSync(gitignorePath, 'utf8');
    if (!existingContent.includes('# Task Master AI Algae')) {
      fs.appendFileSync(gitignorePath, gitignoreAdditions);
      logger.info('Updated .gitignore with Task Master entries');
      createdFiles.push('.gitignore (updated)');
    }
  } else {
    writeTemplateFile(gitignoreAdditions.trim(), gitignorePath);
    createdFiles.push('.gitignore');
  }

  return {
    createdDirectories: createdDirs,
    createdFiles: createdFiles,
    projectRoot: projectRoot
  };
}

/**
 * Register the enhanced init tool
 * @param {Object} server - FastMCP server instance
 */
export function registerInitTool(server) {
  server.addTool({
    name: 'init',
    description: 'Initialize a complete Task Master project with directory structure, configuration files, and Roo Code integration. Creates .taskmaster directories, basic config, roo modes, and template files.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory for the project where Task Master will be initialized. This is required and should be an absolute path to the target project directory.')
    }),
    execute: async (args) => {
      try {
        const projectRoot = args.projectRoot;

        if (!projectRoot) {
          throw new Error('projectRoot parameter is required');
        }

        if (!fs.existsSync(projectRoot)) {
          throw new Error(`Project root directory does not exist: ${projectRoot}`);
        }

        logger.info(`Initializing Task Master project in: ${projectRoot}`);

        const result = createProjectStructure(projectRoot);

        logger.info(`Task Master project initialized successfully in: ${projectRoot}`);

        const response = {
          success: true,
          message: `Task Master project initialized successfully in ${projectRoot}`,
          projectRoot: projectRoot,
          summary: {
            directoriesCreated: result.createdDirectories.length,
            filesCreated: result.createdFiles.length,
            totalItems: result.createdDirectories.length + result.createdFiles.length
          },
          details: {
            directories: result.createdDirectories,
            files: result.createdFiles
          },
          nextSteps: [
            '1. Create a PRD (Project Requirements Document) in .taskmaster/docs/prd.txt using the template in .taskmaster/templates/example_prd.txt',
            '2. Use the parse-prd tool to generate initial tasks from your PRD',
            '3. Use Roo Code modes (architect, code, debug, test) for specialized development tasks',
            '4. Use the boomerang mode to orchestrate complex workflows across multiple modes'
          ]
        };

        return createContentResponse(response);
      } catch (error) {
        logger.error(`Failed to initialize Task Master project: ${error.message}`, {
          error: error.stack,
          args
        });
        return createErrorResponse(`Failed to initialize Task Master project: ${error.message}`);
      }
    }
  });
}