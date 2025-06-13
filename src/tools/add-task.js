import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Register the add-task tool
 * @param {Object} server - FastMCP server instance
 */
export function registerAddTaskTool(server) {
  server.addTool({
    name: 'add_task',
    description: 'Add a new task using AI guidance. Returns detailed instructions for Claude to execute the task creation.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      prompt: z
        .string()
        .describe('Description of the task to add (required for AI-driven creation)'),
      dependencies: z
        .array(z.number())
        .optional()
        .default([])
        .describe('Array of task IDs that this task depends on'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task creation'),
      keywords: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Array of keywords (3-8 technical/business terms) describing this task'),
      flowNames: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Array of business flow names (1-4) this task belongs to'),
      priority: z
        .string()
        .optional()
        .describe('Task priority (high, medium, low)')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, prompt, dependencies, priority, research, keywords, flowNames } = args;
        
        logger.info(`Preparing task creation instructions with prompt: "${prompt}"`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        // Read existing tasks or create new structure
        let tasksData;
        if (fs.existsSync(tasksPath)) {
          try {
            tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
            if (!tasksData || !tasksData.tasks) {
              tasksData = { tasks: [] };
            }
          } catch (error) {
            return createErrorResponse(`Failed to read tasks file: ${error.message}`);
          }
        } else {
          tasksData = { tasks: [] };
        }
        
        // Find the highest task ID to determine the next ID
        const highestId = tasksData.tasks.length > 0 ? Math.max(...tasksData.tasks.map(t => t.id)) : 0;
        const newTaskId = highestId + 1;
        
        // Validate dependencies
        const invalidDeps = dependencies.filter(depId => {
          const numDepId = parseInt(depId, 10);
          return isNaN(numDepId) || !tasksData.tasks.some(t => t.id === numDepId);
        });
        
        const validDependencies = dependencies.filter(depId => !invalidDeps.includes(depId));
        
        // Build context for AI about existing tasks for semantic analysis
        let contextTasks = '';
        
        if (tasksData.tasks.length > 0) {
          // Build context with task relationships and semantic similarity
          const taskMap = {};
          tasksData.tasks.forEach(t => {
            taskMap[t.id] = {
              id: t.id,
              title: t.title,
              description: t.description,
              dependencies: t.dependencies || [],
              status: t.status
            };
          });
          
          // Find tasks that might be semantically related
          const promptLower = prompt.toLowerCase();
          const relatedTasks = tasksData.tasks.filter(t => {
            const taskText = `${t.title} ${t.description} ${t.details || ''}`.toLowerCase();
            return promptLower.split(' ').some(word => 
              word.length > 3 && taskText.includes(word)
            );
          }).slice(0, 8);
          
          if (relatedTasks.length > 0) {
            contextTasks = `\nRelevant existing tasks that might be related:\n${relatedTasks
              .map(t => `- Task ${t.id}: ${t.title} - ${t.description}`)
              .join('\n')}`;
            
            // Add detailed information about the most relevant tasks
            contextTasks += `\n\nDetailed information about relevant tasks:`;
            for (const task of relatedTasks.slice(0, 5)) {
              contextTasks += `\n\n------ Task ${task.id}: ${task.title} ------\n`;
              contextTasks += `Description: ${task.description}\n`;
              contextTasks += `Status: ${task.status || 'pending'}\n`;
              contextTasks += `Priority: ${task.priority || 'medium'}\n`;
              if (task.dependencies && task.dependencies.length > 0) {
                const depList = task.dependencies.map(depId => {
                  const depTask = tasksData.tasks.find(t => t.id === depId);
                  return depTask ? `Task ${depId} (${depTask.title})` : `Task ${depId}`;
                });
                contextTasks += `Dependencies: ${depList.join(', ')}\n`;
              }
              if (task.details) {
                const truncatedDetails = task.details.length > 400 
                  ? task.details.substring(0, 400) + '... (truncated)'
                  : task.details;
                contextTasks += `Implementation Details: ${truncatedDetails}\n`;
              }
            }
          }
          
          // Add recent tasks for context
          const recentTasks = [...tasksData.tasks]
            .sort((a, b) => b.id - a.id)
            .slice(0, 5);
          
          if (recentTasks.length > 0 && !contextTasks.includes('Recently created tasks')) {
            contextTasks += `\n\nRecently created tasks:\n${recentTasks
              .filter(t => !relatedTasks.some(rt => rt.id === t.id))
              .slice(0, 3)
              .map(t => `- Task ${t.id}: ${t.title} - ${t.description}`)
              .join('\n')}`;
          }
        }
        
        // Extract the exact system prompt from the reference implementation
        const systemPrompt = `You are a helpful assistant that creates well-structured tasks for a software development project. Generate a single new task based on the user's description, adhering strictly to the provided JSON schema. Pay special attention to dependencies between tasks, ensuring the new task correctly references any tasks it depends on.

When determining dependencies for a new task, follow these principles:
1. Select dependencies based on logical requirements - what must be completed before this task can begin.
2. Prioritize task dependencies that are semantically related to the functionality being built.
3. Consider both direct dependencies (immediately prerequisite) and indirect dependencies.
4. Avoid adding unnecessary dependencies - only include tasks that are genuinely prerequisite.
5. Consider the current status of tasks - prefer completed tasks as dependencies when possible.
6. Pay special attention to foundation tasks (1-5) but don't automatically include them without reason.
7. Recent tasks (higher ID numbers) may be more relevant for newer functionality.

The dependencies array should contain task IDs (numbers) of prerequisite tasks.`;

        const taskStructureDesc = `
      {
        "title": "Task title goes here",
        "description": "A concise one or two sentence description of what the task involves",
        "details": "Detailed implementation steps, considerations, code examples, or technical approach",
        "testStrategy": "Specific steps to verify correct implementation and functionality",
        "dependencies": [1, 3], // Example: IDs of tasks that must be completed before this task
        "keywords": ["keyword1", "keyword2", "keyword3"], // 3-8 technical/business terms
        "flowNames": ["Business Flow Name"] // 1-4 business flow names
      }
`;

        const userPrompt = `You are generating the details for Task #${newTaskId}. Based on the user's request: "${prompt}", create a comprehensive new task for a software development project.
      
      ${contextTasks}
      
      USER PROVIDED ENHANCEMENTS:
      ${keywords.length > 0 ? `- Keywords: ${keywords.join(', ')}` : '- No keywords provided (AI should suggest 3-8 relevant technical/business terms)'}
      ${flowNames.length > 0 ? `- Flow Names: ${flowNames.join(', ')}` : '- No flow names provided (AI should suggest 1-4 relevant business flow names)'}
      
      DEPENDENCY ANALYSIS INSTRUCTIONS:
      Based on the detailed information about existing tasks provided above, carefully consider which dependencies this new task should have:
      
      1. ANALYZE: Review the entire task context provided above, including task details and implementation specifics.
      2. IDENTIFY: Look for tasks that are semantically similar to this new task (e.g., if creating a CLI command, look for other CLI command tasks).
      3. CONSIDER: Think about both technical requirements and logical task ordering.
      4. AVOID: Don't default to foundational tasks (like Task 1-3) unless this task genuinely requires core infrastructure that isn't already implemented.
      5. PREFER: Select more specific, recently completed or related tasks that this new task would logically build upon.
      6. VALIDATE: Ensure all selected dependencies are necessary and sufficient for this task to begin.
      
      For CLI commands specifically:
      - Look for other CLI command implementation tasks as patterns
      - Consider if this command needs special infrastructure beyond basic task operations
      - Check if similar commands already exist and what they depend on
      
      KEYWORDS AND FLOW NAMES GUIDANCE:
      - **Keywords**: Include 3-8 technical/business terms that describe this task (e.g., technology names, architectural patterns, business domain terms)
      - **Flow Names**: Include 1-4 business flow names this task belongs to (e.g., "User Authentication", "Product Management", "Order Processing")
      - If user provided keywords/flowNames, incorporate them; otherwise suggest appropriate ones based on the task context
      - Ensure consistency with existing tasks when possible
      
      Include these carefully selected task IDs in the "dependencies" array of your response. If there are no logical dependencies beyond basic infrastructure that's likely already implemented, return an empty array [].
      
      Return your answer as a single JSON object matching the schema precisely:
      ${taskStructureDesc}
      
      Make sure the details and test strategy are comprehensive and specific. DO NOT include the task ID in the title.
      `;
        
        // Create the instruction response for Claude to act upon
        const instructions = `I can guide you through creating a new task using AI analysis. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the prompt and existing task context provided above and generate the new task JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the task data from your response
2. Create a new task object with ID ${newTaskId}, status 'pending', and priority '${priority || 'medium'}'
3. Validate any AI-suggested dependencies and merge with user-provided dependencies: ${JSON.stringify(validDependencies)}
4. Add the new task to ${tasksPath}
5. Use the generate_task_files tool to create individual task files
6. Confirm the task was created successfully

**VALIDATION NOTES:**
- Invalid dependencies provided by user (if any): ${JSON.stringify(invalidDeps)}
- Valid dependencies to consider: ${JSON.stringify(validDependencies)}
- AI should suggest additional logical dependencies based on semantic analysis

Please proceed with creating the new task now based on the prompt and instructions above.`;
        
        const result = {
          success: true,
          action: 'add_task_guidance',
          targetFile: tasksPath,
          parameters: {
            newTaskId,
            prompt,
            dependencies: validDependencies,
            invalidDependencies: invalidDeps,
            priority: priority || 'medium',
            keywords,
            flowNames,
            research,
            existingTasksCount: tasksData.tasks.length
          },
          instructions
        };
        
        logger.info(`Generated task creation instructions for task ${newTaskId}${research ? ' with research mode' : ''}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to prepare task creation instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare task creation instructions: ${error.message}`);
      }
    }
  });
}
