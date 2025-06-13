import { z } from 'zod';
import fs from 'fs';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Build relevant tasks chain recursively with cycle detection
 * @param {Array} allTasks - All tasks in the project
 * @param {number} startTaskId - Starting task ID
 * @param {Set} visited - Already visited task IDs (cycle detection)
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Set} Set of relevant task IDs
 */
function buildRelevantTasksChain(allTasks, startTaskId, visited = new Set(), maxDepth = 3) {
  if (visited.has(startTaskId) || maxDepth <= 0) {
    return new Set();
  }
  
  visited.add(startTaskId);
  const relevantIds = new Set([startTaskId]);
  
  const startTask = allTasks.find(t => t.id === startTaskId);
  if (!startTask) return relevantIds;
  
  // Add directly relevant tasks
  if (startTask.relevantTasks && Array.isArray(startTask.relevantTasks)) {
    startTask.relevantTasks.forEach(id => {
      if (!visited.has(id)) {
        relevantIds.add(id);
        // Recursively add their relevant tasks (with reduced depth)
        const subRelevant = buildRelevantTasksChain(allTasks, id, new Set(visited), maxDepth - 1);
        subRelevant.forEach(subId => relevantIds.add(subId));
      }
    });
  }
  
  // Add dependencies (they might be affected by changes)
  if (startTask.dependencies && Array.isArray(startTask.dependencies)) {
    startTask.dependencies.forEach(depId => {
      if (!visited.has(depId)) {
        relevantIds.add(depId);
      }
    });
  }
  
  // Find tasks that depend on this task
  allTasks.forEach(task => {
    if (task.dependencies && task.dependencies.includes(startTaskId) && !visited.has(task.id)) {
      relevantIds.add(task.id);
    }
  });
  
  return relevantIds;
}

/**
 * Determine if tasks should be processed in batches based on size
 * @param {Array} tasksToUpdate - Tasks that need updating
 * @returns {Object} Batch configuration
 */
function determineBatchStrategy(tasksToUpdate) {
  const totalTasks = tasksToUpdate.length;
  const avgTaskSize = JSON.stringify(tasksToUpdate).length / totalTasks;
  
  // Rough token estimation (1 token ≈ 4 characters)
  const estimatedTokens = (JSON.stringify(tasksToUpdate).length / 4) * 1.5; // 1.5x for prompt overhead
  
  if (estimatedTokens > 15000) { // Conservative limit for context window
    const batchSize = Math.max(1, Math.floor(10000 / (avgTaskSize / 4))); // Target ~10k tokens per batch
    return {
      useBatches: true,
      batchSize: Math.min(batchSize, 5), // Max 5 tasks per batch
      totalBatches: Math.ceil(totalTasks / batchSize),
      estimatedTokens
    };
  }
  
  return {
    useBatches: false,
    batchSize: totalTasks,
    totalBatches: 1,
    estimatedTokens
  };
}

/**
 * Register the update-tasks tool with scalable recursive relevant tasks approach
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateTasksTool(server) {
  server.addTool({
    name: 'update_tasks',
    description: 'Update tasks based on new context using AI guidance with scalable recursive relevant tasks approach. Returns detailed instructions for Claude to execute the task updating.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      fromId: z
        .number()
        .optional()
        .describe('Task ID to start updating from (optional, will use relevantTasks if available)'),
      taskIds: z
        .array(z.number())
        .optional()
        .describe('Specific task IDs to update (optional, overrides fromId)'),
      prompt: z
        .string()
        .describe('Prompt with new context for updating tasks'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced task updating'),
      maxDepth: z
        .number()
        .optional()
        .default(2)
        .describe('Maximum recursion depth for relevant tasks chain (1-5)'),
      batchSize: z
        .number()
        .optional()
        .describe('Override automatic batch size calculation')
    }),
    execute: async (args) => {
      try {
        const { projectRoot, fromId, taskIds, prompt, research, maxDepth = 2, batchSize } = args;
        
        logger.info(`Preparing scalable task update instructions with prompt: "${prompt}"`);
        
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
        
        // Determine which tasks to update using relevant tasks approach
        let targetTaskIds = new Set();
        
        if (taskIds && taskIds.length > 0) {
          // Use explicitly provided task IDs
          taskIds.forEach(id => targetTaskIds.add(id));
          logger.info(`Using explicitly provided task IDs: ${taskIds.join(', ')}`);
        } else if (fromId) {
          // Build relevant tasks chain starting from fromId
          const relevantChain = buildRelevantTasksChain(tasksData.tasks, fromId, new Set(), maxDepth);
          targetTaskIds = relevantChain;
          logger.info(`Built relevant tasks chain from ID ${fromId}: ${Array.from(relevantChain).join(', ')}`);
        } else {
          return createErrorResponse('Either fromId or taskIds must be provided');
        }
        
        // Filter to only updatable tasks (not done/completed)
        const tasksToUpdate = tasksData.tasks.filter(task => 
          targetTaskIds.has(task.id) && 
          task.status !== 'done' && 
          task.status !== 'completed'
        );
        
        if (tasksToUpdate.length === 0) {
          return createErrorResponse(`No updatable tasks found in the relevant tasks chain.`);
        }
        
        // Determine batch strategy
        const batchConfig = determineBatchStrategy(tasksToUpdate);
        if (batchSize) {
          batchConfig.batchSize = Math.min(batchSize, tasksToUpdate.length);
          batchConfig.useBatches = batchSize < tasksToUpdate.length;
          batchConfig.totalBatches = Math.ceil(tasksToUpdate.length / batchSize);
        }
        
        logger.info(`Batch strategy: ${batchConfig.useBatches ? 'BATCHED' : 'SINGLE'}, ` +
                   `${batchConfig.totalBatches} batch(es), ${batchConfig.batchSize} tasks per batch, ` +
                   `~${batchConfig.estimatedTokens} estimated tokens`);
        
        // Generate system prompt
        const systemPrompt = `You are an AI assistant helping to update software development tasks based on new context.
You will be given ${batchConfig.useBatches ? 'a batch of' : 'a set of'} tasks and a prompt describing changes or new implementation details.
Your job is to update the tasks to reflect these changes, while preserving their basic structure.

Guidelines:
1. Maintain the same IDs, statuses, and dependencies unless specifically mentioned in the prompt
2. Update titles, descriptions, details, and test strategies to reflect the new information
3. Do not change anything unnecessarily - just adapt what needs to change based on the prompt
4. You should return ALL the tasks provided to you in order, not just the modified ones
5. Return a complete valid JSON array with the updated tasks
6. VERY IMPORTANT: Preserve all subtasks marked as "done" or "completed" - do not modify their content
7. For tasks with completed subtasks, build upon what has already been done rather than rewriting everything
8. If an existing completed subtask needs to be changed/undone based on the new context, DO NOT modify it directly
9. Instead, add a new subtask that clearly indicates what needs to be changed or replaced
10. Use the existence of completed subtasks as an opportunity to make new subtasks more specific and targeted
11. Add or update "relevantTasks" array for each task to include IDs of tasks that should be updated together when this task changes

The changes described in the prompt should be applied to ALL tasks in the ${batchConfig.useBatches ? 'current batch' : 'list'}.${batchConfig.useBatches ? ' This is part of a larger update operation.' : ''}`;

        if (batchConfig.useBatches) {
          // Create batched update instructions
          const instructions = `I can guide you through updating these tasks using a scalable batched approach. Here's exactly what you need to do:

**IMPORTANT**: This is a BATCHED update operation. You'll need to process ${batchConfig.totalBatches} batches of tasks. After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below.

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
2. **Apply the user prompt**: Here are the tasks to update (for current batch):
   [BATCH_TASKS_JSON]
   
   Please update these tasks based on the following new context:
   ${prompt}
   
   IMPORTANT: In the tasks JSON above, any subtasks with "status": "done" or "status": "completed" should be preserved exactly as is. Build your changes around these completed items.
   
   Return only the updated tasks as a valid JSON array.

3. **Process and save**: Parse the updated tasks and merge them back into the full dataset
4. **Continue to next batch**: Repeat until all ${batchConfig.totalBatches} batches are processed

**BATCH BREAKDOWN:**
${Array.from({length: batchConfig.totalBatches}, (_, i) => {
  const start = i * batchConfig.batchSize;
  const end = Math.min(start + batchConfig.batchSize, tasksToUpdate.length);
  const batchTasks = tasksToUpdate.slice(start, end);
  return `Batch ${i + 1}: Tasks ${batchTasks.map(t => t.id).join(', ')} (${batchTasks.length} tasks)`;
}).join('\n')}

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
            action: 'update_tasks_batched_guidance',
            targetFile: tasksPath,
            parameters: {
              fromId,
              taskIds: taskIds || Array.from(targetTaskIds),
              prompt,
              research,
              maxDepth,
              tasksToUpdateCount: tasksToUpdate.length,
              batchConfig,
              relevantTasksChain: Array.from(targetTaskIds)
            },
            instructions
          };
          
          logger.info(`Generated batched task update instructions for ${tasksToUpdate.length} tasks in ${batchConfig.totalBatches} batches${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
          
        } else {
          // Single batch processing (original approach for smaller updates)
          const taskDataString = JSON.stringify(tasksToUpdate, null, 2);
          const userPrompt = `Here are the tasks to update:\n${taskDataString}\n\nPlease update these tasks based on the following new context:\n${prompt}\n\nIMPORTANT: In the tasks JSON above, any subtasks with "status": "done" or "status": "completed" should be preserved exactly as is. Build your changes around these completed items.\n\nReturn only the updated tasks as a valid JSON array.`;
          
          const instructions = `I can guide you through updating these tasks based on new context using the relevant tasks approach. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**RELEVANT TASKS CHAIN:**
${Array.from(targetTaskIds).join(' → ')} (${targetTaskIds.size} tasks in chain, ${tasksToUpdate.length} updatable)

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the tasks and new context provided above and generate the updated tasks JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the updated tasks from your response
2. Update the corresponding tasks in ${tasksPath}
3. Use the generate_task_files tool to create individual task files
4. Confirm the tasks were updated successfully

Please proceed with updating the tasks now based on the context and instructions above.`;

          const result = {
            success: true,
            action: 'update_tasks_guidance',
            targetFile: tasksPath,
            parameters: {
              fromId,
              taskIds: taskIds || Array.from(targetTaskIds),
              prompt,
              research,
              maxDepth,
              tasksToUpdateCount: tasksToUpdate.length,
              batchConfig,
              relevantTasksChain: Array.from(targetTaskIds)
            },
            instructions
          };
          
          logger.info(`Generated task update instructions for ${tasksToUpdate.length} tasks using relevant tasks approach${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
        }
        
      } catch (error) {
        logger.error(`Failed to prepare task update instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare task update instructions: ${error.message}`);
      }
    }
  });
}
