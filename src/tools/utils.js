import fs from 'fs';
import path from 'path';
import logger from '../logger.js';

/**
 * Creates standard content response for tools
 * @param {string|Object} content - Content to include in response
 * @returns {Object} - Content response object in FastMCP format
 */
export function createContentResponse(content) {
  return {
    content: [
      {
        type: 'text',
        text:
          typeof content === 'object'
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
export function createErrorResponse(errorMessage) {
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
 * Read and parse JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {Object|null} Parsed JSON data or null if error
 */
export function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Error reading JSON file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Write JSON data to file
 * @param {string} filePath - Path to write JSON file
 * @param {Object} data - Data to write
 * @returns {boolean} Success status
 */
export function writeJSON(filePath, data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error writing JSON file ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Find a task by ID (supports both task and subtask IDs)
 * @param {Array} tasks - Array of tasks
 * @param {string|number} taskId - Task ID to find
 * @returns {Object|null} Found task/subtask or null
 */
export function findTaskById(tasks, taskId) {
  const idStr = String(taskId);
  
  // Check if it's a subtask ID (contains dot)
  if (idStr.includes('.')) {
    const [parentId, subtaskId] = idStr.split('.');
    const parentTask = tasks.find(t => t.id === parseInt(parentId, 10));
    if (parentTask && parentTask.subtasks) {
      const subtask = parentTask.subtasks.find(st => st.id === parseInt(subtaskId, 10));
      if (subtask) {
        return {
          task: subtask,
          parent: parentTask,
          isSubtask: true
        };
      }
    }
    return null;
  }
  
  // Regular task ID
  const task = tasks.find(t => t.id === parseInt(taskId, 10));
  return task ? { task, parent: null, isSubtask: false } : null;
}

/**
 * Check if a task exists
 * @param {Array} tasks - Array of tasks
 * @param {string|number} taskId - Task ID to check
 * @returns {boolean} Whether task exists
 */
export function taskExists(tasks, taskId) {
  return findTaskById(tasks, taskId) !== null;
}

/**
 * Get task status with basic color coding for console output
 * @param {string} status - Task status
 * @returns {string} Status with basic formatting
 */
export function getStatusDisplay(status) {
  const statusMap = {
    'done': '✅ Done',
    'completed': '✅ Completed', 
    'in-progress': '🔄 In Progress',
    'pending': '⏳ Pending',
    'blocked': '🚫 Blocked',
    'deferred': '⏸️ Deferred',
    'cancelled': '❌ Cancelled'
  };
  
  return statusMap[status] || `❓ ${status}`;
}

/**
 * Validate task status
 * @param {string} status - Status to validate
 * @returns {boolean} Whether status is valid
 */
export function isValidTaskStatus(status) {
  const validStatuses = ['pending', 'in-progress', 'done', 'completed', 'blocked', 'deferred', 'cancelled'];
  return validStatuses.includes(status);
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format dependencies for display
 * @param {Array} dependencies - Array of dependency IDs
 * @param {Array} allTasks - All tasks for status lookup
 * @returns {string} Formatted dependencies string
 */
export function formatDependencies(dependencies, allTasks) {
  if (!dependencies || dependencies.length === 0) {
    return 'None';
  }
  
  return dependencies.map(depId => {
    const depResult = findTaskById(allTasks, depId);
    if (depResult) {
      const status = depResult.task.status;
      const statusIcon = status === 'done' || status === 'completed' ? '✅' : 
                        status === 'in-progress' ? '🔄' : '⏳';
      return `${statusIcon}${depId}`;
    }
    return `❓${depId}`;
  }).join(', ');
}

/**
 * Find the next available task ID
 * @param {Array} tasks - Array of tasks
 * @returns {number} Next available task ID
 */
export function getNextTaskId(tasks) {
  if (!tasks || tasks.length === 0) {
    return 1;
  }
  
  const maxId = Math.max(...tasks.map(t => t.id));
  return maxId + 1;
}

/**
 * Get tasks file path
 * @param {string} projectRoot - Project root directory
 * @returns {string} Tasks file path
 */
export function getTasksFilePath(projectRoot) {
  return path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json');
}

/**
 * Get reports file path
 * @param {string} projectRoot - Project root directory  
 * @returns {string} Reports directory path
 */
export function getReportsPath(projectRoot) {
  return path.join(projectRoot, '.taskmaster', 'reports');
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
