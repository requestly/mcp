import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/updateRuleSchemas.js";
import { z }from "zod";
import { buildResourceUrl, apiErrorResult } from "../apiClient.js";

export function registerUpdateRuleTool(server: McpServer) {
  server.registerTool(
    "update_rule",
    {
      title: "Update Rule",
      description:
        "Update an existing rule in Requestly. Requires ruleId and the updated rule payload. " +
        "Activating a Script/Request/Response rule (status: 'Active') runs code in the browser/request " +
        "pipeline and requires confirmActivation: true — never set it on the user's behalf; a human must " +
        "review the rule's script/code first.",
      inputSchema: {
        ...schema,
        confirmActivation: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Must be set to true by the human operator to activate a code-bearing (Script/Request/Response) rule after they have reviewed the injected code."
          ),
      },
      annotations: {
        title: "Update Rule",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
        // RQ-3011: gate the dangerous Inactive->Active transition for code-bearing
        // rule types behind explicit human confirmation. confirmActivation is read
        // from the raw args (ruleSchema.parse strips unknown keys).
        const CODE_BEARING_RULE_TYPES = new Set(["Script", "Request", "Response"]);
        const willActivateCodeRule =
          validatedArgs.status === "Active" &&
          CODE_BEARING_RULE_TYPES.has(validatedArgs.ruleType as string);
        if (willActivateCodeRule && args.confirmActivation !== true) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Activation requires review. This rule injects code that will run in the " +
                  "browser/request pipeline. Re-issue update_rule with confirmActivation: true " +
                  "only after a human has reviewed the script/code.",
              },
            ],
          };
        }

        const { ruleId, ...rest } = validatedArgs;
        const body = { ...rest };

        const response = await fetch(buildResourceUrl("rules", ruleId),
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
          // RQ-3025: status only — never reflect the upstream body into LLM context.
          return await apiErrorResult("update rule", response);
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
