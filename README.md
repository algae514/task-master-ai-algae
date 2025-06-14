# Task Master AI Algae

A minimal MCP (Model Context Protocol) server for task management, built as a starting point for expanding task master functionality. This server provides AI-driven task management tools that work seamlessly with Claude Desktop.

## Features

- **init**: Initialize a complete Task Master project with directory structure, configuration files, and Roo Code integration
- **Proper logging**: All operations are logged to `logs/task-master-mcp.log` without interfering with MCP stdio communication
- **Roo Code integration**: Sets up .roomodes and rule files for specialized development modes
- **Project structure**: Creates .taskmaster directory with organized subdirectories for tasks, docs, reports, and templates

## Installation

### Method 1: Clone from GitHub (Recommended)

```bash
# Clone the repository
git clone https://github.com/algae514/task-master-ai-algae.git
cd task-master-ai-algae

# Install dependencies
npm install
```

### Method 2: Local Development

```bash
cd /path/to/your/local/copy
npm install
```

## Claude Desktop Integration

### Step 1: Find Your Claude Desktop Config File

The location depends on your operating system:

| OS | Config File Location |
|----|----------------------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\\Claude\\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

### Step 2: Update Your Configuration

Add the following to your `claude_desktop_config.json`:

#### Option A: Using Cloned Repository
```json
{
  "mcpServers": {
    "task-master-ai-algae": {
      "command": "node",
      "args": ["/full/path/to/task-master-ai-algae/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Option B: Using NPX (if published to npm)
```json
{
  "mcpServers": {
    "task-master-ai-algae": {
      "command": "npx",
      "args": ["task-master-ai-algae"]
    }
  }
}
```

**Important**: Replace `/full/path/to/task-master-ai-algae/server.js` with the actual absolute path to your installation.

### Step 3: Example Complete Configuration

If you have other MCP servers, your complete config might look like:

```json
{
  "mcpServers": {
    "task-master-ai-algae": {
      "command": "node",
      "args": ["/Users/username/projects/task-master-ai-algae/server.js"]
    },
    "other-mcp-server": {
      "command": "node",
      "args": ["/path/to/other/server.js"]
    }
  }
}
```

### Step 4: Restart Claude Desktop

After updating the configuration:
1. **Quit Claude Desktop completely** (don't just close the window)
2. **Restart Claude Desktop**
3. **Wait for initialization** (may take a few seconds)

### Step 5: Verify Installation

In Claude Desktop, try saying:
```
Initialize a Task Master project in /path/to/my/project
```

If successful, you should see the Task Master directory structure being created.

## Usage

### Running the MCP Server Standalone (for testing)

```bash
node server.js
```

### Using with Claude Desktop

Once configured, you can use Task Master tools directly in Claude Desktop by asking Claude to:

- **Initialize a project**: "Initialize Task Master in my project at /path/to/project"
- **Get help**: "What Task Master tools are available?"
- **Use tools**: "Use the init tool to set up Task Master in my current project"

### Using the Tools

#### init
Initialize a complete Task Master project:
- Creates `.taskmaster/` directory structure (tasks, docs, reports, templates)
- Sets up Roo Code integration with `.roomodes` and rule files for 6 specialized modes
- Creates basic configuration files and templates
- Adds Task Master entries to `.gitignore`

**Usage**: Provide the `projectRoot` parameter with the absolute path to your project directory.

**Example**: "Use the init tool with projectRoot '/Users/username/myproject' to set up Task Master"

## Adding New Tools

### Step-by-Step Guide

1. **Create the tool file** in `src/tools/`:
   ```javascript
   // src/tools/my-new-tool.js
   import { z } from 'zod';
   import logger from '../logger.js';
   
   function createContentResponse(content) {
     return {
       content: [{ type: 'text', text: typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content) }]
     };
   }
   
   function createErrorResponse(errorMessage) {
     return {
       content: [{ type: 'text', text: `Error: ${errorMessage}` }],
       isError: true
     };
   }
   
   export function registerMyNewTool(server) {
     server.addTool({
       name: 'my_new_tool',
       description: 'Description of what this tool does',
       parameters: z.object({
         param1: z.string().describe('Description of parameter'),
         param2: z.number().optional().describe('Optional parameter')
       }),
       execute: async (args) => {
         try {
           logger.info(`Executing my_new_tool with args: ${JSON.stringify(args)}`);
           
           // Your tool logic here
           const result = { success: true, data: 'some result' };
           
           logger.info('Tool executed successfully');
           return createContentResponse(result);
         } catch (error) {
           logger.error(`Tool failed: ${error.message}`, { error: error.stack, args });
           return createErrorResponse(`Tool failed: ${error.message}`);
         }
       }
     });
   }
   ```

2. **Register the tool** in `src/tools/index.js`:
   ```javascript
   import { registerMyNewTool } from './my-new-tool.js';
   
   export function registerTaskMasterTools(server) {
     try {
       registerInitTool(server);
       registerMyNewTool(server); // Add this line
       
       logger.info('Task Master tools registered successfully');
     } catch (error) {
       logger.error(`Error registering Task Master tools: ${error.message}`, { error: error.stack });
       throw error;
     }
   }
   ```

3. **Restart Claude Desktop** to pick up the new tool

### Critical Requirements

#### ✅ Must Do
- **Use proper MCP response format**: Always return `createContentResponse()` or `createErrorResponse()`
- **Log everything**: Use the file logger, never `console.log` or `console.error`
- **Validate parameters**: Use Zod schemas for parameter validation
- **Handle errors gracefully**: Wrap execute function in try-catch
- **Use absolute paths**: When working with files, always use absolute paths

#### ❌ Critical Pitfalls

1. **NEVER use console.log/console.error**: This breaks MCP stdio communication and causes JSON parsing errors in Claude Desktop

2. **Wrong response format**: Don't return plain objects. This causes schema validation errors:
   ```javascript
   // ❌ Wrong - causes "Unexpected token" errors
   return { success: true, message: "Done" };
   
   // ✅ Correct - proper MCP format
   return createContentResponse({ success: true, message: "Done" });
   ```

3. **Missing error handling**: Unhandled exceptions crash the MCP server:
   ```javascript
   // ❌ Wrong - no error handling
   execute: async (args) => {
     const result = fs.readFileSync(args.file); // Could throw
     return createContentResponse(result);
   }
   
   // ✅ Correct - wrapped in try-catch
   execute: async (args) => {
     try {
       const result = fs.readFileSync(args.file);
       return createContentResponse(result);
     } catch (error) {
       logger.error(`Failed: ${error.message}`);
       return createErrorResponse(`Failed: ${error.message}`);
     }
   }
   ```

4. **Tool name conflicts**: Using existing tool names causes conflicts. Use unique, descriptive names.

5. **Missing parameter validation**: Always define Zod schemas for parameters to prevent runtime errors.

6. **Forgetting to restart Claude Desktop**: Code changes require restarting Claude Desktop to take effect.

## Troubleshooting

### Common Issues

#### MCP Server Not Loading
- **Check logs**: Claude Desktop logs are usually in `~/Library/Logs/Claude/` on macOS
- **Check MCP server logs**: Server logs are written to `logs/task-master-mcp.log` in the project directory
- **Verify path**: Make sure the server.js file exists and is executable
- **Test manually**: You can test the server manually by running `node server.js` in the project directory

#### Schema Validation Errors
- Usually caused by wrong response format - ensure you're using `createContentResponse()`
- Check that all parameters are properly validated with Zod schemas

#### JSON Parsing Errors
- Usually caused by console.log output - ensure you're using the file logger only
- Make sure no tools are outputting to stdout/stderr

#### Tools Not Available
- Ensure Claude Desktop was completely restarted after config changes
- Check that the config file syntax is valid JSON
- Verify the absolute path to server.js is correct

### Debug Steps

1. **Test server standalone**:
   ```bash
   cd /path/to/task-master-ai-algae
   node server.js
   ```

2. **Check Claude Desktop config**:
   ```bash
   # On macOS
   cat "~/Library/Application Support/Claude/claude_desktop_config.json"
   ```

3. **View logs**:
   ```bash
   tail -f logs/task-master-mcp.log
   ```

## Project Structure

```
task-master-ai-algae/
├── package.json
├── server.js                 # Entry point
├── src/
│   ├── index.js             # Main server class
│   ├── logger.js            # File-based logger
│   └── tools/
│       ├── index.js         # Tool registration
│       └── init.js          # Enhanced init tool
├── logs/                    # Generated log files
│   └── task-master-mcp.log
├── TASK_MASTER_TOOLS_DOCUMENTATION.md  # Complete tools reference
├── PRD_DISCIPLINE_FRAMEWORK.md         # PRD best practices
├── IMPLEMENTATION_REPORT.md            # Implementation details
└── README.md
```

## What the Init Tool Creates

When you run the init tool, it creates the following structure in your project:

```
your-project/
├── .taskmaster/
│   ├── config.json          # Basic project configuration
│   ├── tasks/
│   │   └── tasks.json       # Empty tasks file
│   ├── docs/                # For PRD and documentation
│   ├── reports/             # For complexity and other reports
│   └── templates/
│       └── example_prd.txt  # PRD template
├── .roomodes                # Roo Code mode definitions
├── .roo/
│   ├── rules-architect/
│   │   └── architect-rules
│   ├── rules-ask/
│   │   └── ask-rules
│   ├── rules-boomerang/
│   │   └── boomerang-rules
│   ├── rules-code/
│   │   └── code-rules
│   ├── rules-debug/
│   │   └── debug-rules
│   └── rules-test/
│       └── test-rules
└── .gitignore (updated)     # Adds Task Master entries
```

## Related Documentation

- **[Complete Tools Documentation](TASK_MASTER_TOOLS_DOCUMENTATION.md)** - Comprehensive reference for all 31 Task Master tools
- **[PRD Best Practices](PRD_DISCIPLINE_FRAMEWORK.md)** - Guidelines for writing effective PRDs
- **[Implementation Report](IMPLEMENTATION_REPORT.md)** - Technical implementation details

## Repository

- **GitHub**: https://github.com/algae514/task-master-ai-algae
- **Issues**: Report issues or request features on GitHub

## License

MIT
