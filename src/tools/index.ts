import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateRuleTool } from "./createRule.js";
import { registerGetRulesTool } from "./getRules.js";
import { registerUpdateRuleTool } from "./updateRule.js";
import { registerDeleteRuleTool } from "./deleteRule.js";
import { registerCreateGroupTool } from "./createGroup.js";
import { registerGetGroupsTool } from "./getGroups.js";
import { registerUpdateGroupTool } from "./updateGroup.js";
import { registerDeleteGroupTool } from "./deleteGroup.js";

export function registerTools(server: McpServer) {
  registerCreateRuleTool(server);
  registerGetRulesTool(server);
  registerUpdateRuleTool(server);
  registerDeleteRuleTool(server);
  registerCreateGroupTool(server);
  registerGetGroupsTool(server);
  registerUpdateGroupTool(server);
  registerDeleteGroupTool(server);
}
