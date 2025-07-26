# Requestly MCP Server

This project is a Model Context Protocol (MCP) server implemented in TypeScript using the @modelcontextprotocol/sdk. It provides full CRUD tools for Requestly rules and groups, and can be run as a stdio MCP server.

<a href="https://glama.ai/mcp/servers/@requestly/mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@requestly/mcp/badge" alt="Requestly Server MCP server" />
</a>

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
  "args": ["@requestly/mcp"],
  "env": {
    "REQUESTLY_API_KEY": "<your-api-key>"
  }
}
```

```sh
npx @requestly/mcp
```

## Get Your API Key
To use this server, you'll need a Requestly API key.
Request yours by filling out this [short form](https://app.formbricks.com/s/clryn62s316gjdeho9j03t7oa).
Our team will review your request and provide access shortly

## References
- MCP SDK: https://github.com/modelcontextprotocol/create-python-server
- MCP Protocol: https://modelcontextprotocol.io/llms-full.txt
- Requestly API Docs: https://docs.requestly.com/public-apis/overview