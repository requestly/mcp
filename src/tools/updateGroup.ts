import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerUpdateGroupTool(server: McpServer) {
  server.registerTool(
    "update_group",
    {
      title: "Update Group",
      description: "Update a specific group in Requestly.",
      inputSchema: {
        id: z.string().describe("Unique identifier of the group to update."),
        name: z.string().describe("New name of the group."),
        status: z.enum(["Active", "Inactive"]).optional().default("Active"),
        isFavourite: z.boolean().optional().default(false),
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
        const { id, ...rest } = args;
        const response = await fetch(`https://api2.requestly.io/v1/groups/${id}`,
          {
            method: "PUT",
            headers: {
              "accept": "application/json",
              "content-type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify(rest),
          }
        );
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
