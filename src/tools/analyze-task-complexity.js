import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { 
  createContentResponse, 
  createErrorResponse,
  getTasksFilePath
} from './utils.js';

/**
 * Calculate batch configuration for complexity analysis
 * @param {Array} tasks - Tasks to analyze
 * @param {number} requestedBatchSize - User requested batch size
 * @returns {Object} Batch configuration
 */
function calculateBatchConfig(tasks, requestedBatchSize = null) {
  const totalTasks = tasks.length;
  const avgTaskSize = JSON.stringify(tasks).length / totalTasks;
  
  // Rough token estimation (1 token ≈ 4 characters)
  const estimatedTokens = (JSON.stringify(tasks).length / 4) * 2; // 2x for prompt overhead
  
  let batchSize;
  if (requestedBatchSize) {
    batchSize = Math.min(requestedBatchSize, totalTasks);
  } else if (estimatedTokens > 20000) { // Conservative limit for complexity analysis
    batchSize = Math.max(1, Math.floor(15000 / (avgTaskSize / 4))); // Target ~15k tokens per batch
    batchSize = Math.min(batchSize, 10); // Max 10 tasks per batch for complexity analysis
  } else {
    batchSize = totalTasks; // Process all at once
  }
  
  const totalBatches = Math.ceil(totalTasks / batchSize);
  const useBatches = totalBatches > 1;
  
  return {
    useBatches,
    batchSize,
    totalBatches,
    estimatedTokens,
    tokensPerBatch: Math.round(estimatedTokens / totalBatches)
  };
}

/**
 * Register the analyze-task-complexity tool with batch processing support
 * @param {Object} server - FastMCP server instance
 */
export function registerAnalyzeTaskComplexityTool(server) {
  server.addTool({
    name: 'analyze_task_complexity',
    description: 'Analyze task complexity and generate expansion recommendations using AI guidance with scalable batch processing. Returns detailed instructions for Claude to execute the complexity analysis.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder'),
      threshold: z
        .number()
        .optional()
        .default(5)
        .describe('Complexity threshold (1-10 scale)'),
      research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use research-backed analysis for enhanced complexity analysis'),
      id: z
        .string()
        .optional()
        .describe('Comma-separated list of task IDs to analyze specifically'),
      fromId: z
        .number()
        .optional()
        .describe('Starting task ID in a range to analyze'),
      toId: z
        .number()
        .optional()
        .describe('Ending task ID in a range to analyze'),
      batchSize: z
        .number()
        .optional()
        .describe('Number of tasks to process per batch (default: auto-calculated)'),
      resumeFromBatch: z
        .number()
        .optional()
        .describe('Resume processing from specific batch number (1-based)')
    }),
    execute: async (args) => {
      try {
        const { 
          projectRoot, 
          threshold, 
          research, 
          id, 
          fromId, 
          toId, 
          batchSize: requestedBatchSize,
          resumeFromBatch 
        } = args;
        
        logger.info(`Preparing scalable task complexity analysis instructions${research ? ' with research mode' : ''}`);
        
        const tasksPath = getTasksFilePath(projectRoot);
        const outputPath = path.join(projectRoot, '.taskmaster', 'complexity-report.json');
        
        // Validate tasks file exists
        if (!fs.existsSync(tasksPath)) {
          return createErrorResponse(`Tasks file not found: ${tasksPath}`);
        }
        
        // Read and validate tasks data
        let tasksData;
        try {
          tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
          if (!tasksData || !tasksData.tasks || !Array.isArray(tasksData.tasks) || tasksData.tasks.length === 0) {
            return createErrorResponse('No tasks found in the tasks file');
          }
        } catch (error) {
          return createErrorResponse(`Failed to read tasks file: ${error.message}`);
        }
        
        const originalTaskCount = tasksData.tasks.length;
        
        // Read existing complexity report for resume capability
        let existingReport = null;
        let existingAnalysisMap = new Map();
        try {
          if (fs.existsSync(outputPath)) {
            existingReport = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            if (existingReport?.complexityAnalysis && Array.isArray(existingReport.complexityAnalysis)) {
              existingReport.complexityAnalysis.forEach(item => {
                existingAnalysisMap.set(item.taskId, item);
              });
              logger.info(`Found existing complexity report with ${existingReport.complexityAnalysis.length} analyses`);
            }
          }
        } catch (readError) {
          logger.warn(`Could not read existing report: ${readError.message}`);
          existingReport = null;
          existingAnalysisMap.clear();
        }
        
        // Filter tasks based on active status
        const activeStatuses = ['pending', 'blocked', 'in-progress'];
        let filteredTasks = tasksData.tasks.filter((task) =>
          activeStatuses.includes(task.status?.toLowerCase() || 'pending')
        );
        
        // Apply ID filtering if specified
        if (id) {
          const specificIds = id.split(',')
            .map((idStr) => parseInt(idStr.trim(), 10))
            .filter((idNum) => !Number.isNaN(idNum));
          
          if (specificIds.length > 0) {
            filteredTasks = filteredTasks.filter((task) => specificIds.includes(task.id));
          }
        }
        // Apply range filtering if specified
        else if (fromId !== undefined || toId !== undefined) {
          const effectiveFromId = fromId !== undefined ? fromId : 1;
          const effectiveToId = toId !== undefined ? toId : Math.max(...tasksData.tasks.map((t) => t.id));
          
          filteredTasks = filteredTasks.filter(
            (task) => task.id >= effectiveFromId && task.id <= effectiveToId
          );
        }
        
        if (filteredTasks.length === 0) {
          return createErrorResponse('No matching tasks found for analysis');
        }
        
        // Calculate batch configuration
        const batchConfig = calculateBatchConfig(filteredTasks, requestedBatchSize);
        
        logger.info(`Complexity analysis batch strategy: ${batchConfig.useBatches ? 'BATCHED' : 'SINGLE'}, ` +
                   `${batchConfig.totalBatches} batch(es), ${batchConfig.batchSize} tasks per batch, ` +
                   `~${batchConfig.estimatedTokens} estimated tokens`);
        
        // System prompt for complexity analysis
        const systemPrompt = `You are an expert software architect and project manager analyzing task complexity. 
${batchConfig.useBatches ? `You are processing batch data - analyze each task thoroughly.` : ''}
Respond only with the requested valid JSON array.`;
        
        if (batchConfig.useBatches) {
          // Generate batched complexity analysis instructions
          const startBatch = resumeFromBatch || 1;
          const instructions = `I can guide you through analyzing task complexity using a scalable batched approach. Here's exactly what you need to do:

**IMPORTANT**: This is a BATCHED complexity analysis operation. You'll need to process ${batchConfig.totalBatches} batches of tasks${resumeFromBatch ? `, starting from batch ${startBatch}` : ''}. After I provide these instructions, you should immediately execute them.

**BATCH CONFIGURATION:**
- Total tasks to analyze: ${filteredTasks.length}
- Batch size: ${batchConfig.batchSize}
- Total batches: ${batchConfig.totalBatches}
- Estimated tokens per batch: ~${batchConfig.tokensPerBatch}
${resumeFromBatch ? `- Resuming from batch: ${startBatch}` : ''}

**SYSTEM PROMPT:**
${systemPrompt}

**BATCHED EXECUTION PROCESS:**
For each batch (${startBatch} to ${batchConfig.totalBatches}), you should:

1. **Extract the batch**: Take ${batchConfig.batchSize} tasks at a time from the filtered task list
2. **Apply the analysis prompt**: 
   Analyze the following tasks to determine their complexity (1-10 scale) and recommend the number of subtasks for expansion. Provide a brief reasoning and an initial expansion prompt for each.

   Tasks:
   [BATCH_TASKS_JSON]

   Respond ONLY with a valid JSON array matching the schema:
   [
     {
       "taskId": <number>,
       "taskTitle": "<string>",
       "complexityScore": <number 1-10>,
       "recommendedSubtasks": <number>,
       "expansionPrompt": "<string>",
       "reasoning": "<string>"
     },
     ...
   ]

   Do not include any explanatory text, markdown formatting, or code block markers before or after the JSON array.

3. **Process and merge**: Parse the analysis results and merge with existing report data
4. **Save progress**: Update the complexity report file after each batch
5. **Continue to next batch**: Repeat until all batches are processed

**BATCH BREAKDOWN:**
${Array.from({length: batchConfig.totalBatches}, (_, i) => {
  const batchNum = i + 1;
  const start = i * batchConfig.batchSize;
  const end = Math.min(start + batchConfig.batchSize, filteredTasks.length);
  const batchTasks = filteredTasks.slice(start, end);
  const status = batchNum < startBatch ? '✅ COMPLETED' : batchNum === startBatch ? '🔄 START HERE' : '⏳ PENDING';
  return `Batch ${batchNum}: Tasks ${batchTasks.map(t => t.id).join(', ')} (${batchTasks.length} tasks) ${status}`;
}).join('\n')}

**REPORT MERGING STRATEGY:**
- Keep existing analyses for tasks not in current run
- Replace analyses for tasks being re-analyzed
- Update metadata with current run information
- Save incremental progress after each batch

**YOUR NEXT ACTION:**
Start with Batch ${startBatch} and process each batch sequentially. For each batch:
1. Extract the batch tasks from the filtered list
2. Generate complexity analysis JSON according to the specifications
3. Parse and validate the analysis results
4. Merge with existing report data (preserving analyses not in current batch)
5. Save updated report to ${outputPath}
6. Continue to the next batch

**FINAL REPORT STRUCTURE:**
{
  "meta": {
    "generatedAt": "<ISO timestamp>",
    "tasksAnalyzed": ${filteredTasks.length},
    "totalTasks": ${originalTaskCount},
    "thresholdScore": ${threshold},
    "usedResearch": ${research},
    "batchProcessing": {
      "totalBatches": ${batchConfig.totalBatches},
      "batchSize": ${batchConfig.batchSize},
      "lastProcessedBatch": "<will be updated>",
      "resumedFromBatch": ${resumeFromBatch || 'null'}
    }
  },
  "complexityAnalysis": [/* merged analysis array */]
}

Please proceed with processing Batch ${startBatch} now based on the instructions above.`;

          const result = {
            success: true,
            action: 'analyze_task_complexity_batched_guidance',
            targetFile: outputPath,
            parameters: {
              threshold,
              research,
              tasksToAnalyze: filteredTasks.length,
              totalTasks: originalTaskCount,
              id,
              fromId,
              toId,
              batchConfig,
              resumeFromBatch,
              existingAnalysisCount: existingAnalysisMap.size
            },
            instructions
          };
          
          logger.info(`Generated batched complexity analysis instructions for ${filteredTasks.length} tasks in ${batchConfig.totalBatches} batches${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
          
        } else {
          // Single batch processing (original approach for smaller datasets)
          const tasksString = JSON.stringify(filteredTasks, null, 2);
          const userPrompt = `Analyze the following tasks to determine their complexity (1-10 scale) and recommend the number of subtasks for expansion. Provide a brief reasoning and an initial expansion prompt for each.

Tasks:
${tasksString}

Respond ONLY with a valid JSON array matching the schema:
[
  {
    "taskId": <number>,
    "taskTitle": "<string>",
    "complexityScore": <number 1-10>,
    "recommendedSubtasks": <number>,
    "expansionPrompt": "<string>",
    "reasoning": "<string>"
  },
  ...
]

Do not include any explanatory text, markdown formatting, or code block markers before or after the JSON array.`;
          
          const instructions = `I can guide you through analyzing task complexity and generating expansion recommendations. Here's exactly what you need to do:

**IMPORTANT**: After I provide these instructions, you should immediately execute them by following the system prompt and user prompt exactly as specified below. This is not just guidance - please act on these instructions right now.

**SYSTEM PROMPT:**
${systemPrompt}

**USER PROMPT:**
${userPrompt}

**YOUR NEXT ACTION:**
Please now analyze the tasks provided above and generate the complexity analysis JSON according to the specifications. Once you create the JSON response, you should:

1. Parse the complexity analysis from your response
2. Read any existing complexity report from ${outputPath}
3. Merge your new analysis with existing data (preserving previous analyses for tasks not in this run)
4. Create the complete complexity report with metadata and save it to ${outputPath}
5. Confirm the complexity analysis was completed successfully

**REPORT STRUCTURE:**
The final report should be saved as:
{
  "meta": {
    "generatedAt": "<ISO timestamp>",
    "tasksAnalyzed": ${filteredTasks.length},
    "totalTasks": ${originalTaskCount},
    "thresholdScore": ${threshold},
    "usedResearch": ${research}
  },
  "complexityAnalysis": [/* your analysis array merged with existing */]
}

Please proceed with analyzing the task complexity now based on the tasks and instructions above.`;
          
          const result = {
            success: true,
            action: 'analyze_task_complexity_guidance',
            targetFile: outputPath,
            parameters: {
              threshold,
              research,
              tasksToAnalyze: filteredTasks.length,
              totalTasks: originalTaskCount,
              id,
              fromId,
              toId,
              batchConfig,
              existingAnalysisCount: existingAnalysisMap.size
            },
            instructions
          };
          
          logger.info(`Generated task complexity analysis instructions for ${filteredTasks.length} tasks${research ? ' with research mode' : ''}`);
          return createContentResponse(result);
        }
        
      } catch (error) {
        logger.error(`Failed to prepare task complexity analysis instructions: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to prepare task complexity analysis instructions: ${error.message}`);
      }
    }
  });
}
