import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";
import { askHumanToApprove, notApprovedText } from "../humanApproval.js";

export function registerDeleteRuleTool(server: McpServer) {
  server.registerTool(
    "delete_rule",
    {
      title: "Delete Rule",
      description:
        "Delete a specific rule in Requestly using its ruleId. IRREVERSIBLE. " +
        "Before anything is deleted, the user is asked to approve it directly in the MCP host " +
        "(an approval prompt the model cannot answer). If the user does not approve, or the host " +
        "cannot show the prompt, nothing is deleted.",
      inputSchema: {
        ruleId: resourceIdSchema.describe("Unique identifier for the rule to delete."),
      },
      annotations: {
        title: "Delete Rule",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const apiKey = process.env.REQUESTLY_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: REQUESTLY_API_KEY environment variable is not set.",
            },
          ],
        };
      }
      // RQ-3008: the human approves each delete through the host (MCP elicitation).
      // A model-supplied argument can never authorise it.
      const what = `rule "${args.ruleId}"`;
      const approval = await askHumanToApprove(
        server,
        `Permanently delete Requestly rule "${args.ruleId}"? This cannot be undone. ` +
          `Check the rule in the Requestly app first if you're not sure what it is.`,
        { relatedRequestId: extra?.requestId, signal: extra?.signal }
      );
      if (!approval.approved) {
        return { content: [{ type: "text", text: notApprovedText(what, approval.reason) }] };
      }
      try {
        const response = await fetch(buildResourceUrl("rules", args.ruleId),
          {
            method: "DELETE",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        if (!response.ok) {
          // RQ-3025: the success path stringified the upstream body verbatim,
          // which reflected API error payloads into LLM context just as the
          // explicit error branches did.
          return await apiErrorResult("delete rule", response);
        }
        const data = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting rule: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
