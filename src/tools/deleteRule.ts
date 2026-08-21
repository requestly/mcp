import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildResourceUrl, apiErrorResult, resourceIdSchema } from "../apiClient.js";

export function registerDeleteRuleTool(server: McpServer) {
  server.registerTool(
    "delete_rule",
    {
      title: "Delete Rule",
      description:
        "Delete a specific rule in Requestly using its ruleId. IRREVERSIBLE. " +
        "Requires confirm: true. Never set confirm: true on the user's behalf — " +
        "first show the user the exact ruleId and get their explicit approval.",
      inputSchema: {
        ruleId: resourceIdSchema.describe("Unique identifier for the rule to delete."),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Must be explicitly set to true by the human operator to authorize this irreversible deletion."
          ),
      },
      annotations: {
        title: "Delete Rule",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      // RQ-3008: consent boundary — refuse irreversible deletion unless the human
      // operator explicitly confirmed. Blocks prompt-injection-driven deletes.
      if (args.confirm !== true) {
        return {
          content: [
            {
              type: "text",
              text:
                `Confirmation required. This will PERMANENTLY delete rule "${args.ruleId}". ` +
                `This cannot be undone. To proceed, the human operator must re-issue ` +
                `delete_rule with the same ruleId and confirm: true.`,
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
        const response = await fetch(buildResourceUrl("rules", args.ruleId),
          {
            method: "DELETE",
            headers: {
              "accept": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        if (!response.ok) {
          // This handler had no error branch at all: response.json() was
          // stringified straight to the LLM, leaking error bodies via the
          // success path. Same for the other four group/delete handlers.
          return await apiErrorResult("delete rule", response);
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
              text: `Error deleting rule: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
