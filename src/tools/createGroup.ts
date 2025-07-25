import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCreateGroupTool(server: McpServer) {
  server.registerTool(
    "create_group",
    {
      title: "Create Group",
      description: "Create a new group in Requestly.",
      inputSchema: {
        name: z.string().describe("Name of the group to be created."),
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
        const response = await fetch("https://api2.requestly.io/v1/groups", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(args),
        });
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
              text: `Error creating group: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
