import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';

const server = new McpServer({
  name: 'requestly-mcp-server',
  version: '1.0.0',
  description:
    'MCP server for automating and managing Requestly rules, groups, and integrations via the Requestly API.',
  documentation: 'https://docs.requestly.io/api',
  capabilities: {
    resources: {},
    tools: {},
    // Context: This server is designed to expose Requestly API capabilities for rule and group management, CI/CD integration, and data access. Tools will allow creation, update, deletion, and retrieval of rules and groups, as well as custom workflow automation. Authentication is via x-api-key header. No tools are defined yet, but the server is ready for future expansion.
  },
});

async function main() {
  const transport = new StdioServerTransport();
  // Register all tools
  registerTools(server);
  await server.connect(transport);
  console.error('Requestly Weather MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
