import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { REQUESTLY_API_BASE, apiErrorResult, readApiJson } from "../apiClient.js";
import { UNTRUSTED_OUTPUT_DESCRIPTION, untrustedDataResult } from "../untrustedData.js";

export function registerGetGroupsTool(server: McpServer) {
  server.registerTool(
    "get_groups",
    {
      title: "Get Groups",
      description: "Get all groups in Requestly." + UNTRUSTED_OUTPUT_DESCRIPTION,
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
        const response = await fetch(`${REQUESTLY_API_BASE}/groups?${params.toString()}`,
          {
            method: "GET",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        if (!response.ok) {
          // RQ-3025: status only — never reflect the upstream body.
          return await apiErrorResult("get groups", response);
        }
        const parsed = await readApiJson("get groups", response);
        if (!parsed.ok) return parsed.result;
        return untrustedDataResult("get_groups", parsed.data);
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
