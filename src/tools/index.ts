import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateRuleTool } from "./createRule.js";
import { registerGetRulesTool } from "./getRules.js";
import { registerUpdateRuleTool } from "./updateRule.js";
import { registerDeleteRuleTool } from "./deleteRule.js";

export function registerTools(server: McpServer) {
  registerCreateRuleTool(server);
  registerGetRulesTool(server);
  registerUpdateRuleTool(server);
  registerDeleteRuleTool(server);
}
