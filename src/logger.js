import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'task-master-mcp.log');

/**
 * Simple logger that writes to file instead of console
 * to avoid interfering with MCP stdio communication
 */
class Logger {
  constructor() {
    this.logFile = logFile;
  }

  _writeLog(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta })
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      // If we can't log, silently fail to avoid breaking MCP communication
    }
  }

  info(message, meta = null) {
    this._writeLog('info', message, meta);
  }

  error(message, meta = null) {
    this._writeLog('error', message, meta);
  }

  warn(message, meta = null) {
    this._writeLog('warn', message, meta);
  }

  debug(message, meta = null) {
    this._writeLog('debug', message, meta);
  }
}

const logger = new Logger();
export default logger;
