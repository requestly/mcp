# Requestly MCP Server

This project is a Model Context Protocol (MCP) server implemented in TypeScript using the @modelcontextprotocol/sdk. It provides full CRUD tools for Requestly rules and groups, and can be run as a stdio MCP server.

## Features
- Create, read, update, and delete Requestly rules
- Create, read, update, and delete Requestly groups
- Attach rules to groups
- Run as a stdio MCP server for integration with VS Code or other MCP clients


## Usage

### As an MCP server (for VS Code integration)
Configure your `.vscode/mcp.json` to use:

```jsonc
"Requestly Server": {
  "type": "stdio",
  "command": "npx",
  "args": ["requestly-mcp"],
  "env": {
    "REQUESTLY_API_KEY": "<your-api-key>"
  }
}
```


```sh
npx requestly-mcp
```

## References
- MCP SDK: https://github.com/modelcontextprotocol/create-python-server
- MCP Protocol: https://modelcontextprotocol.io/llms-full.txt
- Requestly API Docs: https://requestly.io/api