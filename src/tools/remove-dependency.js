// Placeholder for remove-dependency tool
// TODO: Implement remove dependency functionality
import { z } from 'zod';
import logger from '../logger.js';
import { createContentResponse, createErrorResponse } from './utils.js';

export function registerRemoveDependencyTool(server) {
  server.addTool({
    name: 'remove_dependency',
    description: 'Remove a dependency relationship between tasks.',
    parameters: z.object({
      projectRoot: z.string().describe('Project root directory'),
      taskId: z.string().describe('Task ID to remove dependency from'),
      dependsOn: z.string().describe('Dependency ID to remove')
    }),
    execute: async (args) => {
      return createErrorResponse('remove_dependency tool not yet implemented');
    }
  });
}
