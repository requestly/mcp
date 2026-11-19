import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { REQUESTLY_API_BASE, buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";

export const getGroupsInputSchema = {
  groupId: resourceIdSchema.optional().describe("Unique ID of the group to retrieve. If omitted, retrieves all groups."),
  offset: z.number().int().min(0).optional().describe("Index to start results from (for pagination)."),
  pageSize: z.number().int().min(1).max(75).optional().describe("Number of results to return (max 75)."),
};

export function registerGetGroupsTool(server: McpServer) {
  server.registerTool(
    "get_groups",
    {
      title: "Get Groups",
      description:
        "Retrieve all groups or a specific group from Requestly using its API. Supports pagination and lookup by groupId.",
      inputSchema: getGroupsInputSchema,
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
      const { groupId, offset, pageSize } = args;
      let url = `${REQUESTLY_API_BASE}/groups`;
      if (groupId) {
        url = buildResourceUrl("groups", groupId);
      } else {
        const params = [];
        if (offset !== undefined) params.push(`offset=${offset}`);
        if (pageSize !== undefined) params.push(`pageSize=${pageSize}`);
        if (params.length > 0) {
          url += `?${params.join("&")}`;
        }
      }
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "accept": "application/json",
            "x-api-key": apiKey,
          },
        });
        if (!response.ok) {
          // RQ-3025: status only — never reflect the upstream body.
          return await apiErrorResult("get groups", response);
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
              text: `Error getting groups: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

