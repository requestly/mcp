import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";
import { SERVER_INSTRUCTIONS } from "./untrustedData.js";

/** The Requestly MCP server with every tool registered (RQ-3019: and its instructions). */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "requestly-mcp-server",
      version: "1.0.0",
      description:
        "MCP server for automating and managing Requestly rules, groups, and integrations via the Requestly API.",
      documentation: "https://docs.requestly.io/api",
      capabilities: {
        resources: {},
        tools: {},
      },
    },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerTools(server);
  return server;
}
