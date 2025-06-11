// Placeholder for move-task tool
// TODO: Implement task moving functionality
import { z } from 'zod';
import logger from '../logger.js';
import { createContentResponse, createErrorResponse } from './utils.js';

export function registerMoveTaskTool(server) {
  server.addTool({
    name: 'move_task',
    description: 'Move a task or subtask to a new position.',
    parameters: z.object({
      projectRoot: z.string().describe('Project root directory'),
      fromId: z.string().describe('Source task/subtask ID'),
      toId: z.string().describe('Destination task/subtask ID')
    }),
    execute: async (args) => {
      return createErrorResponse('move_task tool not yet implemented');
    }
  });
}
