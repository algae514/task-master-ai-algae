# Task Master AI - Complete Tools Documentation

## Overview

Task Master AI is a comprehensive AI-driven task management system designed to work with Claude, featuring 29 distinct tools organized into 6 functional groups. This system enables intelligent project management, task breakdown, complexity analysis, and dependency tracking.

## Tool Categories and Complete List

### Group 1: Initialization & Setup (3 tools)

#### 1. `init` (initialize_project)
**Purpose**: Initialize a complete Task Master project with directory structure, configuration files, and Roo Code integration.

**Parameters**:
- `projectRoot` (required): The root directory for the project where Task Master will be initialized
- `skipInstall` (optional, default: false): Skip installing dependencies automatically  
- `addAliases` (optional, default: false): Add shell aliases (tm, taskmaster) to shell config file
- `yes` (optional, default: true): Skip prompts and use default values

**What it creates**:
- `.taskmaster/` directory structure
- `config.json` configuration file
- Roo modes and template files
- Example PRD template
- Basic project scaffolding

#### 2. `models` (register_models_tool)
**Purpose**: View and configure AI model settings for different roles (main, research, fallback).

**Functionality**:
- Display current model configuration
- Show API key status for different providers
- Configure models for main, research, and fallback roles
- Support for multiple AI providers (Anthropic, OpenAI, Google, Perplexity, xAI, OpenRouter, Ollama)

#### 3. `parse_prd` 
**Purpose**: Parse a Product Requirements Document (PRD) file and generate tasks with keywords, flowNames, and relevantTasks arrays.

**Parameters**:
- `projectRoot` (required): Project directory path
- `prdFilePath` (required): Path to the PRD file to parse
- `numTasks` (optional, default: 10): Number of tasks to generate from the PRD
- `research` (optional, default: false): Use research-backed analysis for enhanced task generation

**Features**:
- Generates structured tasks with keywords and business flows
- Creates scalable task relationships through relevantTasks arrays
- Supports both simple and research-enhanced generation

### Group 2: Task Query & Discovery (8 tools)

#### 4. `list_tasks`
**Purpose**: List all tasks with optional filtering by status and including subtasks.

**Parameters**:
- `projectRoot` (required): Project directory path
- `statusFilter` (optional): Filter by task status (pending, in-progress, done, completed, blocked, deferred, cancelled)
- `withSubtasks` (optional, default: false): Include subtasks in the listing

#### 5. `show_task`
**Purpose**: Display detailed information about a specific task or subtask, including all properties, subtasks, and dependencies.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskId` (required): Task ID to show (e.g., "5" for task or "5.2" for subtask)
- `statusFilter` (optional): Filter subtasks by status when showing a parent task

#### 6. `next_task`
**Purpose**: Find the next task to work on based on dependencies, status, and priority.

**Parameters**:
- `projectRoot` (required): Project directory path

**Logic**: Returns the most suitable task to start working on by analyzing:
- Dependency completion status
- Current task status
- Priority levels
- Workflow logic

#### 7. `get_tasks_by_keywords`
**Purpose**: Find tasks that match specified keywords using fuzzy matching with batch processing support.

**Parameters**:
- `projectRoot` (required): Project directory path
- `keywords` (required): Array of keywords to search for in task keywords
- `maxResults` (optional, default: 100): Maximum number of results to return
- `minScore` (optional, default: 0.3): Minimum fuzzy match score (0-1)
- `includeSubtasks` (optional, default: false): Include subtasks in search results
- `sortBy` (optional, default: "score"): Sort results by score, id, or title
- `order` (optional, default: "desc"): Sort order (ascending or descending)
- `statusFilter` (optional): Filter by task status

#### 8. `get_tasks_by_flows`
**Purpose**: Find tasks that belong to specified business flows using fuzzy matching.

**Parameters**:
- `projectRoot` (required): Project directory path
- `flowNames` (required): Array of business flow names to search for
- `maxResults` (optional, default: 100): Maximum number of results to return
- `minScore` (optional, default: 0.4): Minimum fuzzy match score (0-1)
- `includeSubtasks` (optional, default: false): Include subtasks in search results
- `includeFlowAnalysis` (optional, default: false): Include flow distribution analysis in results
- `sortBy` (optional, default: "score"): Sort results by score, id, title, or completion
- `statusFilter` (optional): Filter by task status

#### 9. `list_keywords`
**Purpose**: List all keywords used across tasks with usage statistics, co-occurrence analysis, and filtering options.

**Parameters**:
- `projectRoot` (required): Project directory path
- `maxResults` (optional, default: 100): Maximum number of keywords to return
- `minUsage` (optional, default: 1): Minimum usage count to include keyword
- `includeAnalytics` (optional, default: true): Include keyword analytics and co-occurrence data
- `includeSubtasks` (optional, default: false): Include subtasks in keyword analysis
- `includeTaskDetails` (optional, default: false): Include detailed task information for each keyword
- `searchPattern` (optional): Filter keywords by pattern (case-insensitive substring match)
- `sortBy` (optional, default: "frequency"): Sort by frequency, alphabetical, or tasks

#### 10. `list_flows`
**Purpose**: List all business flows used across tasks with usage statistics, completion status, and dependency analysis.

**Parameters**:
- `projectRoot` (required): Project directory path
- `maxResults` (optional, default: 100): Maximum number of flows to return
- `minUsage` (optional, default: 1): Minimum usage count to include flow
- `includeAnalytics` (optional, default: true): Include flow analytics, dependencies, and completion data
- `includeSubtasks` (optional, default: false): Include subtasks in flow analysis
- `includeTaskDetails` (optional, default: false): Include detailed task information for each flow
- `searchPattern` (optional): Filter flows by pattern
- `sortBy` (optional, default: "frequency"): Sort by frequency, alphabetical, tasks, or completion
- `statusFilter` (optional, default: "all"): Filter flows by completion status

#### 11. `generate_task_files`
**Purpose**: Generate individual task files from tasks.json with separate .txt files for each task.

**Parameters**:
- `projectRoot` (required): Project directory path
- `outputDir` (optional): Output directory for task files (defaults to .taskmaster/tasks/)

**Output**: Creates separate .txt files for each task with all details, subtasks, and formatting.

### Group 3: Task Status & Management (2 tools)

#### 12. `set_task_status`
**Purpose**: Set the status of one or more tasks/subtasks with support for comma-separated task IDs.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskIds` (required): Task ID(s) to update (comma-separated for multiple tasks, e.g., "1,2,3" or "1,2.1,3")
- `status` (required): New status (pending, in-progress, done, completed, blocked, deferred, cancelled)

**Special Logic**: When marking a task as "done", all of its subtasks are automatically marked as "done" as well.

#### 13. `complexity_report`
**Purpose**: Display complexity analysis report for tasks with detailed metrics and recommendations.

**Parameters**:
- `projectRoot` (required): Project directory path

**Output**: Shows comprehensive complexity analysis including:
- Task complexity scores and categorization
- Expansion recommendations
- Complexity distribution statistics
- High-complexity task identification

### Group 4: Task Creation & Modification (11 tools)

#### 14. `add_task`
**Purpose**: Add a new task using AI guidance with support for both prompted and manual task creation.

**Parameters**:
- `projectRoot` (required): Project directory path
- `prompt` (required): Description of the task to add (required for AI-driven creation)
- `dependencies` (optional): Array of task IDs that this task depends on
- `flowNames` (optional): Array of business flow names (1-4) this task belongs to
- `keywords` (optional): Array of keywords (3-8 technical/business terms) describing this task
- `priority` (optional): Task priority (high, medium, low)
- `research` (optional, default: false): Use research-backed analysis for enhanced task creation

#### 15. `add_subtask`
**Purpose**: Add a subtask to an existing parent task or convert an existing task to a subtask.

**Parameters**:
- `projectRoot` (required): Project directory path
- `parentId` (required): ID of the parent task to add the subtask to
- `title` (optional): Title for the new subtask (required if not converting existing task)
- `description` (optional): Description for the new subtask
- `details` (optional): Implementation details for the new subtask
- `existingTaskId` (optional): ID of an existing task to convert to a subtask
- `status` (optional, default: "pending"): Status for the new subtask
- `dependencies` (optional): Array of dependency IDs for the new subtask

#### 16. `update_tasks`
**Purpose**: Update tasks based on new context using AI guidance with scalable recursive relevant tasks approach.

**Parameters**:
- `projectRoot` (required): Project directory path
- `prompt` (required): Prompt with new context for updating tasks
- `fromId` (optional): Task ID to start updating from (will use relevantTasks if available)
- `taskIds` (optional): Specific task IDs to update (overrides fromId)
- `maxDepth` (optional, default: 2): Maximum recursion depth for relevant tasks chain (1-5)
- `batchSize` (optional): Override automatic batch size calculation
- `research` (optional, default: false): Use research-backed analysis for enhanced task updating

#### 17. `update_tasks_by_keywords`
**Purpose**: Update tasks that match specified keywords using AI guidance with scalable batch processing.

**Parameters**:
- `projectRoot` (required): Project directory path
- `keywords` (required): Array of keywords to search for in task keywords
- `prompt` (required): Prompt with new context for updating tasks
- `minScore` (optional, default: 0.3): Minimum fuzzy match score for keyword matching (0-1)
- `includeSubtasks` (optional, default: false): Include subtasks in keyword matching and updates
- `maxDepth` (optional, default: 2): Maximum recursion depth for expanding to related tasks (1-5)
- `batchSize` (optional): Override automatic batch size calculation
- `research` (optional, default: false): Use research-backed analysis for enhanced task updating

#### 18. `update_tasks_by_flows`
**Purpose**: Update tasks that belong to specified business flows using AI guidance with scalable batch processing.

**Parameters**:
- `projectRoot` (required): Project directory path
- `flowNames` (required): Array of business flow names to search for in task flowNames
- `prompt` (required): Prompt with new context for updating tasks
- `minScore` (optional, default: 0.4): Minimum fuzzy match score for flow name matching (0-1)
- `includeSubtasks` (optional, default: false): Include subtasks in flow name matching and updates
- `maxDepth` (optional, default: 2): Maximum recursion depth for expanding to related tasks (1-5)
- `batchSize` (optional): Override automatic batch size calculation
- `research` (optional, default: false): Use research-backed analysis for enhanced task updating

#### 19. `update_task_by_id`
**Purpose**: Update a single task by ID using AI guidance.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskId` (required): Task ID to update
- `prompt` (required): Prompt with new context for updating the task
- `research` (optional, default: false): Use research-backed analysis for enhanced task updating

#### 20. `update_subtask_by_id`
**Purpose**: Update a subtask by appending additional timestamped information using AI guidance.

**Parameters**:
- `projectRoot` (required): Project directory path
- `subtaskId` (required): ID of the subtask to update in format "parentId.subtaskId"
- `prompt` (required): Prompt for generating additional information for the subtask
- `research` (optional, default: false): Use research-backed analysis for enhanced subtask updating

**Note**: Unlike `update_task_by_id`, this command appends new information with timestamps rather than replacing existing content.

#### 21. `remove_task`
**Purpose**: Remove one or more tasks permanently with support for comma-separated task IDs.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskIds` (required): Comma-separated task IDs to remove

#### 22. `remove_subtask`
**Purpose**: Remove a subtask from its parent task with option to convert to standalone task.

**Parameters**:
- `projectRoot` (required): Project directory path
- `subtaskIds` (required): Subtask ID(s) to remove in format "parentId.subtaskId" (comma-separated for multiple)
- `convertToTask` (optional, default: false): Convert the subtask to a standalone task instead of deleting it

#### 23. `clear_subtasks`
**Purpose**: Clear all subtasks from specified parent tasks or all tasks.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskIds` (optional): Comma-separated task IDs to clear subtasks from
- `all` (optional, default: false): Clear subtasks from all tasks (overrides taskIds parameter)

#### 24. `move_task`
**Purpose**: Move a task or subtask to a new position with support for complex reorganization.

**Parameters**:
- `projectRoot` (required): Project directory path
- `fromId` (required): Source task/subtask ID
- `toId` (required): Destination task/subtask ID

**Capabilities**:
- Move task to become a subtask
- Move subtask to become a standalone task
- Move subtask to a different parent
- Reorder subtasks within the same parent
- Move a task to a new ID position (creates placeholder if doesn't exist)

### Group 5: Task Analysis & Expansion (3 tools)

#### 25. `analyze_task_complexity`
**Purpose**: Analyze task complexity and generate expansion recommendations using AI guidance with scalable batch processing.

**Parameters**:
- `projectRoot` (required): Project directory path
- `threshold` (optional, default: 5): Complexity threshold (1-10 scale)
- `batchSize` (optional): Number of tasks to process per batch (auto-calculated if not provided)
- `fromId` (optional): Starting task ID in a range to analyze
- `toId` (optional): Ending task ID in a range to analyze
- `id` (optional): Comma-separated list of task IDs to analyze specifically
- `resumeFromBatch` (optional): Resume processing from specific batch number (1-based)
- `research` (optional, default: false): Use research-backed analysis for enhanced complexity analysis

**Output**: Generates detailed complexity report with:
- Complexity scores for each task (1-10 scale)
- Expansion recommendations based on threshold
- Task categorization (high/medium/low complexity)
- Batch processing support for large task sets

#### 26. `expand_task`
**Purpose**: Expand a task into subtasks using AI guidance with support for complexity-based recommendations.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskId` (required): Task ID to expand into subtasks
- `numSubtasks` (optional): Explicit target number of subtasks (uses complexity report or config default if not provided)
- `additionalContext` (optional): Optional additional context for task expansion
- `force` (optional, default: false): If true, replace existing subtasks; otherwise, append
- `research` (optional, default: false): Use research-backed analysis for enhanced task expansion

**Features**:
- Intelligent subtask generation based on task complexity
- Integration with complexity analysis for optimal subtask count
- Support for both appending and replacing existing subtasks
- Context-aware expansion using additional prompts

#### 27. `expand_all` (expand_all_tasks)
**Purpose**: Expand all pending tasks or tasks meeting specific criteria into subtasks using batch processing.

**Parameters**:
- Similar to expand_task but operates on multiple tasks
- Supports batch processing for efficiency
- Filters by task status and complexity scores

### Group 6: Dependency Management (4 tools)

#### 28. `add_dependency`
**Purpose**: Add a dependency relationship between tasks where the target task will depend on the dependency task.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskId` (required): ID of the task that will have the dependency (can be task or subtask ID like "5" or "5.2")
- `dependsOn` (required): ID of the task that becomes a dependency (can be task or subtask ID like "3" or "3.1")

#### 29. `remove_dependency`
**Purpose**: Remove a dependency relationship between tasks.

**Parameters**:
- `projectRoot` (required): Project directory path
- `taskId` (required): Task ID to remove dependency from
- `dependsOn` (required): Dependency ID to remove

#### 30. `validate_dependencies`
**Purpose**: Validate all task dependencies and identify issues without making changes.

**Parameters**:
- `projectRoot` (required): Project directory path

**Output**: Reports on:
- Invalid dependency references
- Circular dependencies
- Missing task references
- Inconsistent dependency states

#### 31. `fix_dependencies`
**Purpose**: Automatically fix invalid task dependencies based on validation results.

**Parameters**:
- `projectRoot` (required): Project directory path

**Actions**:
- Removes invalid dependency references
- Resolves circular dependencies
- Cleans up missing task references
- Corrects inconsistent dependency states

## Key Features Across All Tools

### 1. **AI Integration**
- **Research Mode**: Many tools support research-backed analysis using external AI services (Perplexity AI)
- **Context Awareness**: Tools understand project context and maintain consistency
- **Intelligent Defaults**: Automatic parameter inference based on project state

### 2. **Scalability Features**
- **Batch Processing**: Large operations are automatically batched for performance
- **Fuzzy Matching**: Keyword and flow searches use intelligent fuzzy matching
- **Recursive Operations**: Tools can follow relevantTasks chains for comprehensive updates

### 3. **Data Structure**
- **Keywords System**: Each task has 3-8 technical/business keywords for categorization
- **Business Flows**: Tasks belong to 1-4 business flows for workflow organization
- **Relevant Tasks**: Scalable relationship system for task interconnections
- **Dependency Management**: Full support for task dependencies with validation

### 4. **File Management**
- **Centralized Storage**: All data stored in `.taskmaster/` directory
- **JSON Format**: Human-readable task storage in `tasks.json`
- **Individual Files**: Option to generate separate files for each task
- **Backup Support**: Automatic backup creation during destructive operations

### 5. **Status Management**
Task statuses include:
- `pending`: Not yet started
- `in-progress`: Currently being worked on
- `done`: Completed by user
- `completed`: Verified complete
- `blocked`: Cannot proceed due to dependencies
- `deferred`: Postponed to later
- `cancelled`: No longer needed

## Installation and Setup

```bash
# Global installation
npm install -g task-master-ai

# Project initialization
task-master init

# Or via MCP integration in your editor
```

## Configuration Files

### `.taskmaster/config.json`
Project-specific configuration including:
- AI model settings (main, research, fallback)
- Default parameters for task generation
- Project-specific preferences

### `.taskmaster/docs/prd.txt`
Product Requirements Document for task generation

### `.taskmaster/tasks/tasks.json`
Central task storage with full task data

### `.taskmaster/reports/`
Complexity analysis reports and other generated reports

## Best Practices

1. **Start with PRD**: Always begin with a detailed Product Requirements Document
2. **Use Keywords**: Maintain consistent keyword vocabularies for better organization
3. **Leverage Business Flows**: Group related tasks into business flows for workflow clarity
4. **Regular Complexity Analysis**: Run complexity analysis to identify tasks needing expansion
5. **Dependency Planning**: Use dependency management to ensure proper task sequencing
6. **Research Mode**: Enable research mode for complex or unfamiliar domains

This comprehensive toolset provides everything needed for AI-driven project management, from initial project setup through task completion and analysis.
