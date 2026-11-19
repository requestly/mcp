import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";
import { askHumanToApprove, notApprovedText } from "../humanApproval.js";

export function registerDeleteGroupTool(server: McpServer) {
  server.registerTool(
    "delete_group",
    {
      title: "Delete Group",
      description:
        "Delete a specific group in Requestly using its id. IRREVERSIBLE. The rules inside the " +
        "group are not deleted; they stay in the workspace without a group. " +
        "Before anything is deleted, the user is asked to approve it directly in the MCP host " +
        "(an approval prompt the model cannot answer). If the user does not approve, or the host " +
        "cannot show the prompt, nothing is deleted.",
      inputSchema: {
        id: resourceIdSchema.describe("Unique identifier of the group to delete."),
      },
      annotations: {
        title: "Delete Group",
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
      const what = `group "${args.id}"`;
      const approval = await askHumanToApprove(
        server,
        `Permanently delete Requestly group "${args.id}"? This cannot be undone. ` +
          `The rules inside it are kept, without a group.`,
        { relatedRequestId: extra?.requestId, signal: extra?.signal }
      );
      if (!approval.approved) {
        return { content: [{ type: "text", text: notApprovedText(what, approval.reason) }] };
      }
      try {
        const response = await fetch(buildResourceUrl("groups", args.id),
          {
            method: "DELETE",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        if (!response.ok) {
          // RQ-3025: status only — never reflect the upstream body.
          return await apiErrorResult("delete group", response);
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
              text: `Error deleting group: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
