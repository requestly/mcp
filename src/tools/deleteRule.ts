import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDeleteRuleTool(server: McpServer) {
  server.registerTool(
    "delete_rule",
    {
      title: "Delete Rule",
      description: "Delete a specific rule in Requestly using its ruleId.",
      inputSchema: {
        ruleId: z.string().describe("Unique identifier for the rule to delete."),
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
        const response = await fetch(`https://api2.requestly.io/v1/rules/${args.ruleId}`,
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
              text: `Error deleting rule: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
