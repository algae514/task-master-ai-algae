import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';
import { fuzzyMatchFlows } from './fuzzy-matching-utils.js';
import { 
  determineBatchStrategy,
  buildFieldBasedTasksChain,
  generateBatchBreakdown 
} from './batch-processing-utils.js';

/**
 * Register the update-tasks-by-flows tool
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateTasksByFlowsTool(server) {
  server.addTool({
    name: 'update_tasks_by_flows',
    description: 'Update tasks that belong to specified business flows using AI guidance with scalable batch processing. Uses fuzzy flow name matching to find relevant tasks.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      flowNames: z
        .array(z.string())
        .describe('Array of business flow names to search for in task flowNames'),
      prompt: z
        .string()
        .describe('Prompt with new context for updating tasks'),
      minScore: z
        .number()
        .optional()
        .default(0.4)
        .describe('Minimum fuzzy match score for flow name matching (0-1, default: 0.4)'),
      maxDepth: z
        .number()
        .optional()
        .default(2)
        .describe('Maximum recursion depth for expanding to related tasks (1-5)'),
      batchSize: z
        .number()
        .optional()
        .describe('Override automatic batch size calculation'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task updating'),
      includeSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include subtasks in flow name matching and updates')
    }),
    execute: async (args) => {
      try {
        const { 
          projectRoot, 
          flowNames, 
          prompt, 
          minScore, 
          maxDepth, 
          batchSize, 
          research,
          includeSubtasks 
        } = args;
        
        logger.info(`Preparing flow-based task update instructions with flows: ${flowNames.join(', ')}`);
        
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
        
        // Build flow-based relevant tasks chain
        const targetTaskIds = buildFieldBasedTasksChain(
          tasksData.tasks, 
          flowNames, 
          minScore, 
          maxDepth,
          fuzzyMatchFlows,
          'flowNames'
        );
        
        if (targetTaskIds.size === 0) {
          return createErrorResponse(`No tasks found matching flow names: ${flowNames.join(', ')} with minimum score ${minScore}`);
        }
        
        // Filter to only updatable tasks (not done/completed)
        const tasksToUpdate = tasksData.tasks.filter(task => 
          targetTaskIds.has(task.id) && 
          task.status !== 'done' && 
          task.status !== 'completed'
        );
        
        if (tasksToUpdate.length === 0) {
          return createErrorResponse(`No updatable tasks found matching flow names. All matching tasks are already completed.`);
        }
        
        // Determine batch strategy
        const batchConfig = determineBatchStrategy(tasksToUpdate);
        if (batchSize) {
          batchConfig.batchSize = Math.min(batchSize, tasksToUpdate.length);
          batchConfig.useBatches = batchSize < tasksToUpdate.length;
          batchConfig.totalBatches = Math.ceil(tasksToUpdate.length / batchSize);
        }
        
        logger.info(`Flow-based batch strategy: ${batchConfig.useBatches ? 'BATCHED' : 'SINGLE'}, ` +
                   `${batchConfig.totalBatches} batch(es), ${batchConfig.batchSize} tasks per batch, ` +
                   `~${batchConfig.estimatedTokens} estimated tokens`);
        
        // Generate system prompt
        const systemPrompt = `You are an AI assistant helping to update software development tasks based on new context and business flow-based filtering.
You will be given ${batchConfig.useBatches ? 'a batch of' : 'a set of'} tasks that were selected based on their flow names matching: ${flowNames.join(', ')}.
Your job is to update these flow-matched tasks to reflect the changes described in the prompt, while preserving their basic structure.

Guidelines:
1. Maintain the same IDs, statuses, and dependencies unless specifically mentioned in the prompt
2. Update titles, descriptions, details, test strategies, keywords, and flowNames to reflect the new information
3. Ensure keywords arrays remain relevant (3-8 technical/business terms per task)
4. Update flowNames arrays to reflect business flow changes (1-4 business flow names per task)
5. Do not change anything unnecessarily - just adapt what needs to change based on the prompt
6. You should return ALL the tasks provided to you in order, not just the modified ones
7. Return a complete valid JSON array with the updated tasks
8. VERY IMPORTANT: Preserve all subtasks marked as "done" or "completed" - do not modify their content
9. For tasks with completed subtasks, build upon what has already been done rather than rewriting everything
10. If an existing completed subtask needs to be changed/undone based on the new context, DO NOT modify it directly
11. Instead, add a new subtask that clearly indicates what needs to be changed or replaced
12. Use the existence of completed subtasks as an opportunity to make new subtasks more specific and targeted
13. Add or update "relevantTasks" array for each task to include IDs of tasks that should be updated together when this task changes

The changes described in the prompt should be applied to ALL tasks in the ${batchConfig.useBatches ? 'current batch' : 'list'}.${batchConfig.useBatches ? ' This is part of a larger update operation.' : ''}

IMPORTANT: Since these tasks were selected based on business flow matching, ensure the updates maintain coherence with the original business flows: ${flowNames.join(', ')}`;

        if (batchConfig.useBatches) {
          // Create batched update instructions
          const instructions = `I can guide you through updating flow-matched tasks using a scalable batched approach. Here's exactly what you need to do:

**IMPORTANT**: This is a BATCHED update operation. You'll need to process ${batchConfig.totalBatches} batches of tasks. After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below.

**FLOW-BASED SELECTION:**
- Search flow names: ${flowNames.join(', ')}
- Minimum match score: ${minScore}
- Tasks found: ${targetTaskIds.size} (${tasksToUpdate.length} updatable)
- Recursion depth: ${maxDepth}

**BATCH CONFIGURATION:**
- Total tasks to update: ${tasksToUpdate.length}
- Batch size: ${batchConfig.batchSize}
- Total batches: ${batchConfig.totalBatches}
- Estimated tokens per batch: ~${Math.round(batchConfig.estimatedTokens / batchConfig.totalBatches)}

**SYSTEM PROMPT:**
${systemPrompt}

**BATCHED EXECUTION PROCESS:**
For each batch (1 to ${batchConfig.totalBatches}), you should:

1. **Extract the batch**: Take tasks ${batchConfig.batchSize} at a time from the full task list
2. **Apply the user prompt**: Here are the flow-matched tasks to update (for current batch):
   [BATCH_TASKS_JSON]
   
   Please update these tasks based on the following new context:
   ${prompt}
   
   IMPORTANT: In the tasks JSON above, any subtasks with "status": "done" or "status": "completed" should be preserved exactly as is. Build your changes around these completed items.
   
   FLOW CONTEXT: These tasks were selected because their flow names matched: ${flowNames.join(', ')}. Ensure updates maintain coherence with these business flows.
   
   Return only the updated tasks as a valid JSON array.

3. **Process and save**: Parse the updated tasks and merge them back into the full dataset
4. **Continue to next batch**: Repeat until all ${batchConfig.totalBatches} batches are processed

**BATCH BREAKDOWN:**
${generateBatchBreakdown(tasksToUpdate, batchConfig)}

**YOUR NEXT ACTION:**
Start with Batch 1 and process each batch sequentially. For each batch:
1. Generate the updated tasks JSON according to the specifications
2. Parse and validate the updated tasks
3. Update the corresponding tasks in ${tasksPath}
4. Continue to the next batch

After all batches are complete:
1. Use the generate_task_files tool to create individual task files
2. Confirm all tasks were updated successfully

Please proceed with processing Batch 1 now based on the instructions above.`;

          const result = {
            success: true,
            action: 'update_tasks_by_flows_batched_guidance',
            targetFile: tasksPath,
            parameters: {
              flowNames,
              prompt,
              minScore,
              maxDepth,
              research,
              includeSubtasks,
              tasksToUpdateCount: tasksToUpdate.length,
              batchConfig,
              flowMatchedTaskIds: Array.from(targetTaskIds)
            },
            instructions
          };
          
          logger.info(`Generated batched flow-based task update instructions for ${tasksToUpdate.length} tasks in ${batchConfig.totalBatches} batches${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
          
        } else {
          // Single batch processing for smaller updates
          const taskDataString = JSON.stringify(tasksToUpdate, null, 2);
          const userPrompt = `Here are the flow-matched tasks to update:\n${taskDataString}\n\nPlease update these tasks based on the following new context:\n${prompt}\n\nIMPORTANT: In the tasks JSON above, any subtasks with "status": "done" or "status": "completed" should be preserved exactly as is. Build your changes around these completed items.\n\nFLOW CONTEXT: These tasks were selected because their flow names matched: ${flowNames.join(', ')}. Ensure updates maintain coherence with these business flows.\n\nReturn only the updated tasks as a valid JSON array.`;
          
          const instructions = `I can guide you through updating flow-matched tasks based on new context. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**FLOW-BASED SELECTION:**
- Search flow names: ${flowNames.join(', ')}
- Minimum match score: ${minScore}
- Tasks found: ${targetTaskIds.size} (${tasksToUpdate.length} updatable)
- Matched task IDs: ${Array.from(targetTaskIds).join(' → ')}

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the flow-matched tasks and new context provided above and generate the updated tasks JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the updated tasks from your response
2. Update the corresponding tasks in ${tasksPath}
3. Use the generate_task_files tool to create individual task files
4. Confirm the tasks were updated successfully

Please proceed with updating the flow-matched tasks now based on the context and instructions above.`;

          const result = {
            success: true,
            action: 'update_tasks_by_flows_guidance',
            targetFile: tasksPath,
            parameters: {
              flowNames,
              prompt,
              minScore,
              maxDepth,
              research,
              includeSubtasks,
              tasksToUpdateCount: tasksToUpdate.length,
              batchConfig,
              flowMatchedTaskIds: Array.from(targetTaskIds)
            },
            instructions
          };
          
          logger.info(`Generated flow-based task update instructions for ${tasksToUpdate.length} tasks${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
        }
        
      } catch (error) {
        logger.error(`Failed to prepare flow-based task update instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare flow-based task update instructions: ${error.message}`);
      }
    }
  });
}
