import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const getRulesInputSchema = {
  ruleId: z.string().optional().describe("Unique ID of the rule to retrieve. If omitted, retrieves all rules."),
  offset: z.number().int().min(0).optional().describe("Index to start results from (for pagination)."),
  pageSize: z.number().int().min(1).max(75).optional().describe("Number of results to return (max 75)."),
};

export function registerGetRulesTool(server: McpServer) {
  server.registerTool(
    "get_rules",
    {
      title: "Get Rules",
      description:
        "Retrieve all rules or a specific rule from Requestly using its API. Supports pagination and lookup by ruleId.",
      inputSchema: getRulesInputSchema,
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
      const { ruleId, offset, pageSize } = args;
      let url = "https://api2.requestly.io/v1/rules";
      if (ruleId) {
        url += `/${encodeURIComponent(ruleId)}`;
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
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text",
                text: `Failed to get rules: ${response.status} ${errorText}`,
              },
            ],
          };
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
              text: `Error getting rules: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
