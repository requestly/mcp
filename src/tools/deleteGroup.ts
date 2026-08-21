import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";

export function registerDeleteGroupTool(server: McpServer) {
  server.registerTool(
    "delete_group",
    {
      title: "Delete Group",
      description:
        "Delete a specific group in Requestly using its id. IRREVERSIBLE and CASCADES " +
        "— deleting a group also deletes every rule it contains. Requires confirm: true. " +
        "Never set confirm: true on the user's behalf — first show the user the exact group " +
        "id and get their explicit approval.",
      inputSchema: {
        id: resourceIdSchema.describe("Unique identifier of the group to delete."),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Must be explicitly set to true by the human operator to authorize this irreversible, cascading deletion."
          ),
      },
      annotations: {
        title: "Delete Group",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      // RQ-3008: consent boundary — group deletion cascades to all child rules,
      // so refuse unless the human operator explicitly confirmed.
      if (args.confirm !== true) {
        return {
          content: [
            {
              type: "text",
              text:
                `Confirmation required. This will PERMANENTLY delete group "${args.id}" ` +
                `AND every rule inside it. This cannot be undone. To proceed, the human ` +
                `operator must re-issue delete_group with the same id and confirm: true.`,
            },
          ],
        };
      }
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
      try {
        const { id } = args;
        const response = await fetch(buildResourceUrl("groups", id),
          {
            method: "DELETE",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        if (!response.ok) {
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
