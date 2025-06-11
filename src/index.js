import { FastMCP } from 'fastmcp';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { registerTaskMasterTools } from './tools/index.js';
import logger from './logger.js';

// Load environment variables
dotenv.config();

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main MCP server class for minimal Task Master
 */
class TaskMasterMCPServer {
  constructor() {
    // Get version from package.json
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    this.options = {
      name: 'Task Master AI Algae MCP Server',
      version: packageJson.version
    };

    this.server = new FastMCP(this.options);
    this.initialized = false;

    // Bind methods
    this.init = this.init.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
  }

  /**
   * Initialize the MCP server with necessary tools
   */
  async init() {
    if (this.initialized) return;

    logger.info('Initializing Task Master MCP Server');
    
    // Register tools
    registerTaskMasterTools(this.server);

    this.initialized = true;
    logger.info('Task Master MCP Server initialized successfully');
    return this;
  }

  /**
   * Start the MCP server
   */
  async start() {
    if (!this.initialized) {
      await this.init();
    }

    logger.info('Starting Task Master MCP Server');
    
    // Start the FastMCP server
    await this.server.start({
      transportType: 'stdio',
      timeout: 120000 // 2 minutes timeout
    });

    logger.info('Task Master MCP Server started successfully');
    return this;
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    if (this.server) {
      logger.info('Stopping Task Master MCP Server');
      await this.server.stop();
      logger.info('Task Master MCP Server stopped');
    }
  }
}

export default TaskMasterMCPServer;
