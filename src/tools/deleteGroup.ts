import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDeleteGroupTool(server: McpServer) {
  server.registerTool(
    "delete_group",
    {
      title: "Delete Group",
      description: "Delete a specific group in Requestly using its id.",
      inputSchema: {
        id: z.string().describe("Unique identifier of the group to delete."),
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
        const { id } = args;
        const response = await fetch(`https://api2.requestly.io/v1/groups/${id}`,
          {
            method: "DELETE",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
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
              text: `Error deleting group: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
