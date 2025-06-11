// Placeholder for remove-task tool
// TODO: Implement task removal functionality
import { z } from 'zod';
import logger from '../logger.js';
import { createContentResponse, createErrorResponse } from './utils.js';

export function registerRemoveTaskTool(server) {
  server.addTool({
    name: 'remove_task',
    description: 'Remove one or more tasks permanently.',
    parameters: z.object({
      projectRoot: z.string().describe('Project root directory'),
      taskIds: z.string().describe('Comma-separated task IDs to remove')
    }),
    execute: async (args) => {
      return createErrorResponse('remove_task tool not yet implemented');
    }
  });
}
