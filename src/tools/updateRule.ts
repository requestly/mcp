import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/updateRuleSchemas.js";
import { z }from "zod";

export function registerUpdateRuleTool(server: McpServer) {
  server.registerTool(
    "update_rule",
    {
      title: "Update Rule",
      description:
        "Update an existing rule in Requestly. Requires ruleId and the updated rule payload.",
      inputSchema: schema

    },
    async (args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
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
        // Validate input using the extended ruleSchema
        const validatedArgs: ValidatedRuleArgs = ruleSchema.parse(args);
        if (!validatedArgs.ruleId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: ruleId is required.",
              },
            ],
          };
        }
        const { ruleId, ...rest } = validatedArgs;
        const body: Record<string, unknown> = { ...rest };
        // Ensure required fields for Requestly
        body.objectType = 'rule';

        const response = await fetch(`https://api2.requestly.io/v1/rules/${ruleId}`,
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
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text",
                text: `Failed to update rule: ${response.status} ${errorText}`,
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
              text: `Error updating rule: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
