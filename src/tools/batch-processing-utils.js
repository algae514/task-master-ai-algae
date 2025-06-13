/**
 * Batch Processing Utilities for Keywords and Flow Names
 * Handles large result sets and batch processing strategies
 */

/**
 * Process tasks in batches for large result sets
 * @param {Array} matchedTasks - Tasks that matched the search criteria
 * @param {Object} options - Batch processing options
 * @returns {Object} Batch processing result
 */
export function processBatchResults(matchedTasks, options = {}) {
  const { 
    batchSize = 50, 
    sortBy = 'score', 
    order = 'desc',
    includeSubtasks = false 
  } = options;
  
  // Sort by score, then by ID
  matchedTasks.sort((a, b) => {
    if (sortBy === 'score') {
      if (order === 'desc') {
        return b.score - a.score || a.id - b.id;
      } else {
        return a.score - b.score || a.id - b.id;
      }
    } else if (sortBy === 'id') {
      return order === 'desc' ? b.id - a.id : a.id - b.id;
    } else if (sortBy === 'title') {
      const aTitle = a.title || '';
      const bTitle = b.title || '';
      return order === 'desc' ? bTitle.localeCompare(aTitle) : aTitle.localeCompare(bTitle);
    }
    return 0;
  });
  
  const totalMatches = matchedTasks.length;
  const totalBatches = Math.ceil(totalMatches / batchSize);
  
  return {
    tasks: matchedTasks,
    totalMatches,
    totalBatches,
    batchSize,
    useBatching: totalMatches > batchSize,
    metadata: {
      sortedBy: sortBy,
      order,
      includeSubtasks
    }
  };
}

/**
 * Determine if tasks should be processed in batches based on size
 * @param {Array} tasksToUpdate - Tasks that need updating
 * @returns {Object} Batch configuration
 */
export function determineBatchStrategy(tasksToUpdate) {
  const totalTasks = tasksToUpdate.length;
  if (totalTasks === 0) {
    return {
      useBatches: false,
      batchSize: 0,
      totalBatches: 0,
      estimatedTokens: 0
    };
  }
  
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
 * Build relevant tasks chain using keywords matching
 * @param {Array} allTasks - All tasks in the project
 * @param {Array} keywords - Keywords to match
 * @param {number} minScore - Minimum match score
 * @param {number} maxDepth - Maximum recursion depth
 * @param {Function} matchFunction - Function to use for matching (fuzzyMatchKeywords or fuzzyMatchFlows)
 * @param {string} fieldName - Field name to check ('keywords' or 'flowNames')
 * @returns {Set} Set of relevant task IDs
 */
export function buildFieldBasedTasksChain(allTasks, searchTerms, minScore, maxDepth, matchFunction, fieldName) {
  const relevantIds = new Set();
  const visited = new Set();
  
  // Find directly matching tasks
  for (const task of allTasks) {
    if (task[fieldName] && Array.isArray(task[fieldName]) && task[fieldName].length > 0) {
      const score = matchFunction(searchTerms, task[fieldName]);
      if (score >= minScore) {
        relevantIds.add(task.id);
      }
    }
  }
  
  // Expand to related tasks using existing relevantTasks arrays (if present)
  if (maxDepth > 0) {
    const initialIds = Array.from(relevantIds);
    for (const taskId of initialIds) {
      const task = allTasks.find(t => t.id === taskId);
      if (task && task.relevantTasks && Array.isArray(task.relevantTasks)) {
        task.relevantTasks.forEach(relatedId => {
          if (!visited.has(relatedId)) {
            relevantIds.add(relatedId);
            visited.add(relatedId);
          }
        });
      }
    }
  }
  
  return relevantIds;
}

/**
 * Generate batch breakdown text for instructions
 * @param {Array} tasksToUpdate - Tasks to be updated
 * @param {Object} batchConfig - Batch configuration
 * @returns {string} Formatted batch breakdown
 */
export function generateBatchBreakdown(tasksToUpdate, batchConfig) {
  return Array.from({length: batchConfig.totalBatches}, (_, i) => {
    const start = i * batchConfig.batchSize;
    const end = Math.min(start + batchConfig.batchSize, tasksToUpdate.length);
    const batchTasks = tasksToUpdate.slice(start, end);
    return `Batch ${i + 1}: Tasks ${batchTasks.map(t => t.id).join(', ')} (${batchTasks.length} tasks)`;
  }).join('\n');
}
