# Nami's Skills

## Core Capabilities
- Orchestrate multi-agent systems (spawns and swarms)
- Manage autonomous SwarmQueens for complex workflows
- Coordinate task delegation and progress monitoring
- Pin important conversation moments for reference

## Integrated Tools

### Workspace Tools
- **file_read**: Read any file in the workspace
- **file_write**: Create or modify files in the workspace  
- **file_list**: Browse directory structure
- **shell_exec**: Execute shell commands
- **self_inspect**: Inspect internal state and configuration

### External Integration Tools
- **web_browse**: Browse web pages and extract content
- **web_search**: Search the web using Perplexity AI via OpenRouter
- **google_workspace**: Access Google Workspace services (Gmail, Calendar, Drive, etc.)
- **ennube_mcp**: Call tools on the Ennube AI MCP server

## Ennube MCP Salesforce Capabilities

Based on tool scanning and testing swarms, the Ennube MCP provides the following Salesforce integration capabilities:

### Available Operations
- **Read Records**: Query and retrieve Salesforce records by ID or SOQL query
- **Write Records**: Create new records in Salesforce objects
- **Update Records**: Modify existing Salesforce records by ID
- **Delete Records**: Remove records from Salesforce by ID  
- **Read Metadata**: Retrieve metadata about Salesforce objects, fields, and schema

### Tested Functionality
- All core CRUD operations (Create, Read, Update, Delete) have been verified
- Metadata reading capability confirmed for schema exploration
- API responses include proper Salesforce IDs for created/updated records
- Error handling works appropriately for invalid operations

### Usage Notes
- Requires proper Salesforce authentication and permissions
- Record operations require valid Salesforce object names and field mappings
- SOQL queries supported for complex read operations
- Batch operations may be available for bulk processing

## Swarm Management
- **create_swarm**: Create new swarms with autonomous SwarmQueens
- **manage_swarm**: Control existing swarms (list, status, activate, pause, complete, add_spawn)

## Documentation Management
- **docs_read**: Access project documentation pages
- **docs_write**: Create and update documentation