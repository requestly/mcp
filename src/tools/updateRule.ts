import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/updateRuleSchemas.js";
import { buildResourceUrl, apiErrorResult } from "../apiClient.js";
import { askHumanToAcceptCode, codeItems, codeNotApprovedText, newCode } from "../codeApproval.js";

/** The parts of a saved rule that matter for an update; any difference means it changed. */
function ruleVersion(rule: any): string {
  if (!rule || typeof rule !== "object") return "";
  const { modificationDate, name, description, status, ruleType, pairs, groupId } = rule;
  return JSON.stringify([modificationDate, name, description, status, ruleType, pairs, groupId]);
}

export function registerUpdateRuleTool(server: McpServer) {
  server.registerTool(
    "update_rule",
    {
      title: "Update Rule",
      description:
        "Update an existing rule in Requestly. Requires ruleId and ruleType; any field left out " +
        "(name, description, status, pairs) keeps its saved value. If the update adds or changes code " +
        "in a Script, Request or Response rule (inline scripts, script URLs, request/response bodies), " +
        "the user is shown the old and new code (in the MCP host prompt, or in a local file it names) and must accept it (an approval prompt " +
        "the model cannot answer); otherwise nothing is changed. Turning a rule on or off, renaming it, " +
        "or changing its URL match does not ask.",
      inputSchema: schema,
      annotations: {
        title: "Update Rule",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (
      args: Record<string, unknown>,
      extra?: { requestId?: string | number; signal?: AbortSignal }
    ): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
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
        const { ruleId } = validatedArgs;
        const headers = {
          "accept": "application/json",
          "content-type": "application/json",
          "x-api-key": apiKey,
        };

        // Read the rule as saved. api2's PUT replaces the whole rule, so anything
        // the model leaves out is filled from here (before, a missing name became
        // "API: <type> Rule <time>" and a missing status became Active). It is
        // also the "before" side of the code comparison: the model's own account
        // of the saved rule is never trusted.
        const current = await fetch(buildResourceUrl("rules", ruleId), { method: "GET", headers });
        if (!current.ok) {
          // RQ-3025: status only — never reflect the upstream body into LLM context.
          return await apiErrorResult("read the rule before updating it", current);
        }
        const currentJson: any = await current.json();
        const saved: any = currentJson?.data ?? currentJson;
        if (!saved || typeof saved !== "object" || typeof saved.ruleType !== "string") {
          return { content: [{ type: "text", text: "Failed to update rule: the saved rule could not be read." }] };
        }
        if (saved.ruleType !== validatedArgs.ruleType) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Not updated: rule ${ruleId} is a ${saved.ruleType} rule and a rule's type can't be changed. ` +
                  `Create a new ${validatedArgs.ruleType} rule instead.`,
              },
            ],
          };
        }

        const body: Record<string, unknown> = {
          name: validatedArgs.name ?? saved.name,
          description: validatedArgs.description ?? saved.description,
          objectType: "rule",
          ruleType: saved.ruleType,
          status: validatedArgs.status ?? saved.status,
          pairs: validatedArgs.pairs ?? saved.pairs,
        };
        if (saved.groupId) {
          body.groupId = saved.groupId;
        }

        // RQ-3011 / RQ-3021: new or changed code needs the user's Accept in the host.
        const before = codeItems(saved.ruleType, saved.pairs);
        const after = codeItems(saved.ruleType, body.pairs);
        const added = newCode(before, after);
        if (added.length > 0) {
          const kept = new Set(after.map((i) => i.key));
          const approval = await askHumanToAcceptCode(
            server,
            {
              action: "update",
              ruleType: saved.ruleType,
              name: String(body.name ?? ruleId),
              status: String(body.status ?? "Inactive"),
              added,
              replaced: before.filter((i) => !kept.has(i.key)),
            },
            { relatedRequestId: extra?.requestId, signal: extra?.signal }
          );
          if (!approval.approved) {
            return { content: [{ type: "text", text: codeNotApprovedText(`rule ${ruleId}`, approval.reason) }] };
          }
          // The prompt can stay open for minutes. If the rule changed meanwhile, the
          // user approved against a version that is no longer the saved one, and the
          // merged body would overwrite the newer change: save nothing. (This narrows
          // the window; an atomic check needs an api2 precondition, tracked as RQ-3014.)
          const again = await fetch(buildResourceUrl("rules", ruleId), { method: "GET", headers });
          if (!again.ok) {
            return await apiErrorResult("re-read the rule before saving it", again);
          }
          const againJson: any = await again.json();
          if (ruleVersion(againJson?.data ?? againJson) !== ruleVersion(saved)) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Not saved: rule ${ruleId} changed while the approval prompt was open, so the code the user ` +
                    `reviewed no longer matches what is saved. Nothing was changed. Do not retry unless the user asks again.`,
                },
              ],
            };
          }
        }

        const response = await fetch(buildResourceUrl("rules", ruleId), {
          method: "PUT",
          headers,
          body: JSON.stringify(body),
        });
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
