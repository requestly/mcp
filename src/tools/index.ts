import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateRuleTool } from "./createRule.js";

export function registerTools(server: McpServer) {
  registerCreateRuleTool(server);
}
