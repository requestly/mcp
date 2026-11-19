# Requestly MCP Server

This project is a Model Context Protocol (MCP) server implemented in TypeScript using the @modelcontextprotocol/sdk. It provides full CRUD tools for Requestly rules and groups, and can be run as a stdio MCP server.

## Features
- Create, read, update, and delete Requestly rules
- Create, read, update, and delete Requestly groups
- Attach rules to groups
- Run as a stdio MCP server for integration with VS Code or other MCP clients

## Deleting rules and groups
`delete_rule` and `delete_group` ask **you** to approve every delete before anything is removed. The approval prompt comes from your MCP host (for example Claude Code or VS Code) through [MCP elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation), so the AI model can't approve a delete on your behalf.

- If you decline, cancel, or don't answer within 5 minutes, nothing is deleted.
- If your host doesn't support elicitation, these tools can't delete; delete the rule or group in the [Requestly app](https://app.requestly.io/rules/my-rules) instead.
- Deleting a group keeps the rules inside it; they stay in your workspace without a group.


## Requirements
- Node.js 22.23.4+ or 24.22.1+. Older versions miss the October 2026 Node.js security fixes.

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
