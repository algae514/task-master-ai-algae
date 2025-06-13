/**
 * Fuzzy Matching Utilities for Keywords and Flow Names
 * Provides string similarity and matching functions for task filtering
 */

/**
 * Calculate string similarity using simple edit distance approach
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
export function calculateSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const editDistance = levenshteinDistance(str1, str2);
  return 1 - (editDistance / maxLen);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
export function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i += 1) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j += 1) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Fuzzy match keywords against task keywords
 * @param {Array} searchKeywords - Keywords to search for
 * @param {Array} taskKeywords - Keywords from task
 * @returns {number} Match score (0-1)
 */
export function fuzzyMatchKeywords(searchKeywords, taskKeywords) {
  if (!searchKeywords || !taskKeywords || searchKeywords.length === 0 || taskKeywords.length === 0) {
    return 0;
  }
  
  let matches = 0;
  const normalizedSearch = searchKeywords.map(k => k.toLowerCase().trim());
  const normalizedTask = taskKeywords.map(k => k.toLowerCase().trim());
  
  for (const searchKeyword of normalizedSearch) {
    for (const taskKeyword of normalizedTask) {
      // Exact match
      if (searchKeyword === taskKeyword) {
        matches += 1;
        continue;
      }
      
      // Partial match (one contains the other)
      if (searchKeyword.includes(taskKeyword) || taskKeyword.includes(searchKeyword)) {
        matches += 0.7;
        continue;
      }
      
      // Similar words (edit distance based)
      if (calculateSimilarity(searchKeyword, taskKeyword) > 0.8) {
        matches += 0.5;
      }
    }
  }
  
  // Normalize score
  return Math.min(matches / Math.max(searchKeywords.length, taskKeywords.length), 1);
}

/**
 * Fuzzy match flow names against task flow names
 * @param {Array} searchFlows - Flow names to search for
 * @param {Array} taskFlows - Flow names from task
 * @returns {number} Match score (0-1)
 */
export function fuzzyMatchFlows(searchFlows, taskFlows) {
  if (!searchFlows || !taskFlows || searchFlows.length === 0 || taskFlows.length === 0) {
    return 0;
  }
  
  let matches = 0;
  const normalizedSearch = searchFlows.map(f => f.toLowerCase().trim());
  const normalizedTask = taskFlows.map(f => f.toLowerCase().trim());
  
  for (const searchFlow of normalizedSearch) {
    for (const taskFlow of normalizedTask) {
      // Exact match
      if (searchFlow === taskFlow) {
        matches += 1;
        continue;
      }
      
      // Partial match (one contains the other)
      if (searchFlow.includes(taskFlow) || taskFlow.includes(searchFlow)) {
        matches += 0.8;
        continue;
      }
      
      // Similar words (edit distance based)
      if (calculateSimilarity(searchFlow, taskFlow) > 0.85) {
        matches += 0.6;
      }
    }
  }
  
  // Normalize score - for flows we want higher precision
  return Math.min(matches / Math.max(searchFlows.length, taskFlows.length), 1);
}

/**
 * Get matched keywords/flows for display purposes
 * @param {Array} searchTerms - Terms being searched for
 * @param {Array} taskTerms - Terms from task
 * @returns {Array} Array of matched terms
 */
export function getMatchedTerms(searchTerms, taskTerms) {
  if (!searchTerms || !taskTerms) return [];
  
  return taskTerms.filter(term => 
    searchTerms.some(searchTerm => 
      term.toLowerCase().includes(searchTerm.toLowerCase()) ||
      searchTerm.toLowerCase().includes(term.toLowerCase())
    )
  );
}
