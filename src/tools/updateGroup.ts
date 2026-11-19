import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";

export function registerUpdateGroupTool(server: McpServer) {
  server.registerTool(
    "update_group",
    {
      title: "Update Group",
      description: "Update a specific group in Requestly.",
      inputSchema: {
        id: resourceIdSchema.describe("Unique identifier of the group to update."),
        name: z.string().optional().describe("New name of the group."),
        status: z.enum(["Active", "Inactive"]).optional().describe("Status of the group."),
        isFavourite: z.boolean().optional().describe("Whether the group is marked as favourite."),
      },
    },
    async (args) => {
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
        const { id, name, status, isFavourite } = args;
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (status !== undefined) body.status = status;
        if (isFavourite !== undefined) body.isFavourite = isFavourite;

        const response = await fetch(buildResourceUrl("groups", id),
          {
            method: "PUT",
            headers: {
              "accept": "application/json",
              "content-type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify(body),
          }
        );
        if (!response.ok) {
          // RQ-3025: status only — never reflect the upstream body.
          return await apiErrorResult("update group", response);
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
              text: `Error updating group: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

