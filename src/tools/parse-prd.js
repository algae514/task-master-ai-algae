import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Register the parse-prd tool
 * @param {Object} server - FastMCP server instance
 */
export function registerParsePRDTool(server) {
  server.addTool({
    name: 'parse_prd',
    description: 'Parse a PRD file and generate tasks. Returns detailed instructions for Claude to execute the task parsing.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      prdFilePath: z
        .string()
        .describe('Path to the PRD file to parse'),
      numTasks: z
        .number()
        .optional()
        .default(10)
        .describe('Number of tasks to generate from the PRD'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task generation')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, prdFilePath, numTasks, research } = args;
        
        logger.info(`Preparing PRD parsing instructions for: ${prdFilePath}`);
        
        // Validate PRD file exists
        if (!fs.existsSync(prdFilePath)) {
          return createErrorResponse(`PRD file not found: ${prdFilePath}`);
        }
        
        // Read PRD content
        const prdContent = fs.readFileSync(prdFilePath, 'utf8');
        if (!prdContent.trim()) {
          return createErrorResponse(`PRD file is empty: ${prdFilePath}`);
        }
        
        const tasksPath = getTasksFilePath(projectRoot);
        
        // Determine next ID by checking existing tasks
        let nextId = 1;
        if (fs.existsSync(tasksPath)) {
          try {
            const existingData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
            if (existingData && Array.isArray(existingData.tasks) && existingData.tasks.length > 0) {
              nextId = Math.max(...existingData.tasks.map(t => t.id || 0)) + 1;
            }
          } catch (error) {
            logger.warn(`Could not read existing tasks, starting from ID 1: ${error.message}`);
          }
        }
        
        // Extract the exact system prompt from the reference implementation
        const researchPromptAddition = research
          ? `\
Before breaking down the PRD into tasks, you will:
1. Research and analyze the latest technologies, libraries, frameworks, and best practices that would be appropriate for this project
2. Identify any potential technical challenges, security concerns, or scalability issues not explicitly mentioned in the PRD without discarding any explicit requirements or going overboard with complexity -- always aim to provide the most direct path to implementation, avoiding over-engineering or roundabout approaches
3. Consider current industry standards and evolving trends relevant to this project (this step aims to solve LLM hallucinations and out of date information due to training data cutoff dates)
4. Evaluate alternative implementation approaches and recommend the most efficient path
5. Include specific library versions, helpful APIs, and concrete implementation guidance based on your research
6. Always aim to provide the most direct path to implementation, avoiding over-engineering or roundabout approaches

Your task breakdown should incorporate this research, resulting in more detailed implementation guidance, more accurate dependency mapping, and more precise technology recommendations than would be possible from the PRD text alone, while maintaining all explicit requirements and best practices and all details and nuances of the PRD.`
          : '';
        
        const systemPrompt = `You are an AI assistant specialized in analyzing Product Requirements Documents (PRDs) and generating a structured, logically ordered, dependency-aware and sequenced list of development tasks in JSON format.${researchPromptAddition}

Analyze the provided PRD content and generate approximately ${numTasks} top-level development tasks. If the complexity or the level of detail of the PRD is high, generate more tasks relative to the complexity of the PRD
Each task should represent a logical unit of work needed to implement the requirements and focus on the most direct and effective way to implement the requirements without unnecessary complexity or overengineering. Include pseudo-code, implementation details, and test strategy for each task. Find the most up to date information to implement each task.
Assign sequential IDs starting from ${nextId}. Infer title, description, details, and test strategy for each task based *only* on the PRD content.
Set status to 'pending', dependencies to an empty array [], and priority to 'medium' initially for all tasks.
Respond ONLY with a valid JSON object containing a single key \"tasks\", where the value is an array of task objects adhering to the provided Zod schema. Do not include any explanation or markdown formatting.

Each task should follow this JSON structure:
{
\t\"id\": number,
\t\"title\": string,
\t\"description\": string,
\t\"status\": \"pending\",
\t\"dependencies\": number[] (IDs of tasks this depends on),
\t\"priority\": \"high\" | \"medium\" | \"low\",
\t\"details\": string (implementation details),
\t\"testStrategy\": string (validation approach)
}

Guidelines:
1. Unless complexity warrants otherwise, create exactly ${numTasks} tasks, numbered sequentially starting from ${nextId}
2. Each task should be atomic and focused on a single responsibility following the most up to date best practices and standards
3. Order tasks logically - consider dependencies and implementation sequence
4. Early tasks should focus on setup, core functionality first, then advanced features
5. Include clear validation/testing approach for each task
6. Set appropriate dependency IDs (a task can only depend on tasks with lower IDs, potentially including existing tasks with IDs less than ${nextId} if applicable)
7. Assign priority (high/medium/low) based on criticality and dependency order
8. Include detailed implementation guidance in the \"details\" field${research ? ', with specific libraries and version recommendations based on your research' : ''}
9. If the PRD contains specific requirements for libraries, database schemas, frameworks, tech stacks, or any other implementation details, STRICTLY ADHERE to these requirements in your task breakdown and do not discard them under any circumstance
10. Focus on filling in any gaps left by the PRD or areas that aren't fully specified, while preserving all explicit requirements
11. Always aim to provide the most direct path to implementation, avoiding over-engineering or roundabout approaches${research ? '\
12. For each task, include specific, actionable guidance based on current industry standards and best practices discovered through research' : ''}`;
        
        const userPrompt = `Here's the Product Requirements Document (PRD) to break down into approximately ${numTasks} tasks, starting IDs from ${nextId}:${research ? '\
\
Remember to thoroughly research current best practices and technologies before task breakdown to provide specific, actionable implementation details.' : ''}\
\
${prdContent}\
\


Return your response in this format:
{
    \"tasks\": [
        {
            \"id\": 1,
            \"title\": \"Setup Project Repository\",
            \"description\": \"...\",
            ...
        },
        ...
    ],
    \"metadata\": {
        \"projectName\": \"PRD Implementation\",
        \"totalTasks\": ${numTasks},
        \"sourceFile\": \"${prdFilePath}\",
        \"generatedAt\": \"${new Date().toISOString().split('T')[0]}\"
    }
}`;
        
        // Create the instruction response for Claude to act upon
        const instructions = `I can guide you through parsing this PRD and generating tasks. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the PRD content provided above and generate the tasks JSON according to the specifications. Once you create the JSON response, save it to the file: ${tasksPath}

**ADDITIONAL STEPS AFTER GENERATING TASKS:**
1. Save the generated JSON to ${tasksPath}
2. Use the generate_task_files tool to create individual task files
3. Confirm the tasks were created successfully

Please proceed with generating the tasks now based on the PRD content and instructions above.`;
        
        const result = {
          success: true,
          action: 'parse_prd_guidance',
          prdFile: prdFilePath,
          targetFile: tasksPath,
          parameters: {
            numTasks,
            nextId,
            research
          },
          instructions
        };
        
        logger.info(`Generated PRD parsing instructions for ${numTasks} tasks${research ? ' with research mode' : ''}`);
        
        return createContentResponse(result);
      } catch (error) {
        logger.error(`Failed to prepare PRD parsing instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare PRD parsing instructions: ${error.message}`);
      }
    }
  });
}
