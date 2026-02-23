# MCP Integration Guide

## Overview
This document explains how to integrate Model Context Protocol (MCP) tools into the Nami system for enhanced AI agent capabilities.

## Available MCP Tools
The system currently supports integration with:
- Ennube MCP server for AI-powered cloud infrastructure
- Zoho CRM API integrations
- Clari sales data connections

## Usage Examples

### Listing MCP Tools
```json
{
  "method": "tools/list"
}
```

### Calling an MCP Tool
```json
{
  "method": "tools/call",
  "tool_name": "zoho_crm_list_accounts",
  "tool_args": "{\"limit\": 10}"
}
```

## Configuration
To enable MCP integration, ensure the following environment variables are set:
- `ENNUBE_MCP_APIKEY` - Authentication key for Ennube MCP services
- `MCP_SERVER_URL` - Base URL for MCP server endpoints

## Best Practices
1. Always validate tool responses before processing
2. Implement proper error handling for MCP service failures
3. Cache frequently accessed MCP endpoints when appropriate
4. Monitor MCP usage to avoid rate limiting