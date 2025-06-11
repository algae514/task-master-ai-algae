// Placeholder for models tool
// TODO: Implement model configuration functionality (basic version without LLM)
import { z } from 'zod';
import logger from '../logger.js';
import { createContentResponse, createErrorResponse } from './utils.js';

export function registerModelsTool(server) {
  server.addTool({
    name: 'models',
    description: 'Manage AI model configurations (basic version without LLM integration).',
    parameters: z.object({
      projectRoot: z.string().describe('Project root directory')
    }),
    execute: async (args) => {
      return createErrorResponse('models tool not yet implemented');
    }
  });
}
