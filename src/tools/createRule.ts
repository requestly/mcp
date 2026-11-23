import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/createRuleSchemas.js";
import { REQUESTLY_API_BASE, apiErrorResult } from "../apiClient.js";
import { askHumanToAcceptCode, codeItems, codeNotApprovedText } from "../codeApproval.js";

export function registerCreateRuleTool(server: McpServer) {
  server.registerTool(
  'create_rule',
  {
    title: 'Create Rule',
    description:
      'This endpoint allows you to create various types of rules in Requestly, such as Redirect, Cancel, Replace, Headers, User-Agent, Script (Insert Script), Query Param, Modify Request, Modify Response, and Delay. Each rule has a specific structure and parameters based on the ruleType. ' +
      'New rules default to Inactive. A Script, Request or Response rule carries code that runs in the browser ' +
      '(inline scripts, script URLs, request/response bodies): before such a rule is saved, the user is shown ' +
      'the code (in the MCP host prompt, or in a local file it names) and must accept it (an approval prompt the model cannot answer). If the user ' +
      'does not accept, or the host cannot show the prompt, nothing is saved.',
    inputSchema: schema,
    annotations: {
      title: 'Create Rule',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (args: Record<string, unknown>, extra?: { requestId?: string | number; signal?: AbortSignal }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    try {
      // Validate the full request using our discriminated union schema
      const validatedArgs: ValidatedRuleArgs = ruleSchema.parse(args);
      const { name, description, ruleType, status, pairs, groupId } = validatedArgs;
      const apiKey = process.env.REQUESTLY_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: REQUESTLY_API_KEY environment variable is not set.',
            },
          ],
        };
      }
      const effectiveStatus = status ?? 'Inactive';

      // RQ-3011 / RQ-3021: code the model wrote is saved only after the user has
      // seen it and accepted it in the host. A model-supplied argument (the old
      // confirmActivation) can never stand in for that.
      const code = codeItems(ruleType, pairs);
      if (code.length > 0) {
        const approval = await askHumanToAcceptCode(
          server,
          { action: 'create', ruleType, name, status: effectiveStatus, added: code },
          { relatedRequestId: extra?.requestId, signal: extra?.signal }
        );
        if (!approval.approved) {
          return { content: [{ type: 'text', text: codeNotApprovedText(`the new ${ruleType} rule`, approval.reason) }] };
        }
      }

      const body: Record<string, unknown> = {
        name,
        objectType: 'rule',
        status: effectiveStatus,
        ruleType,
        pairs,
        description: description || undefined,
      };
      if (groupId) {
        body.groupId = groupId;
      }

      const response = await fetch(`${REQUESTLY_API_BASE}/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });
    if (!response.ok) {
      // RQ-3025: status only — never reflect the upstream body into LLM context.
      return await apiErrorResult('create rule', response);
    }
    const data = await response.json();
    const note =
      effectiveStatus === 'Inactive'
        ? '\n\nNOTE: This rule was created INACTIVE. It takes effect once it is turned on.'
        : '';
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) + note }],
    };
  }
  catch (error) {
    console.error('Error in create_rule tool:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating rule: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }})
}
