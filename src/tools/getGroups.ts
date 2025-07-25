import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerGetGroupsTool(server: McpServer) {
  server.registerTool(
    "get_groups",
    {
      title: "Get Groups",
      description: "Get all groups in Requestly.",
      inputSchema: {
        offset: z.number().optional().default(0),
        pageSize: z.number().optional().default(30),
      },
    },
    async (args)=> {
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
        const params = new URLSearchParams();
        if (typeof args.offset === "number") params.append("offset", String(args.offset));
        if (typeof args.pageSize === "number") params.append("pageSize", String(args.pageSize));
        const response = await fetch(`https://api2.requestly.io/v1/groups?${params.toString()}`,
          {
            method: "GET",
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
              text: `Error getting groups: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
