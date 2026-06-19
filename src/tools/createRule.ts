import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/createRuleSchemas.js";

export function registerCreateRuleTool(server: McpServer) {
  server.registerTool(
  'create_rule',
  {
    title: 'Create Rule',
    description:
      'This endpoint allows you to create various types of rules in Requestly, such as Redirect, Cancel, Replace, Headers, User-Agent, Script (Insert Script), Query Param, Modify Request, Modify Response, and Delay. Each rule has a specific structure and parameters based on the ruleType. ' +
      'New rules default to Inactive. Script/Request/Response rules (which can execute code in the browser/request pipeline) are ALWAYS created Inactive and must be reviewed by a human and explicitly activated before they take effect.',
    inputSchema: schema,
    annotations: {
      title: 'Create Rule',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
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
      // RQ-3011: code-bearing rule types can execute attacker-controlled code in
      // the page / request pipeline. Force them Inactive on creation regardless of
      // what was requested, so an injected prompt can't create a live code rule.
      // Other rule types default to Inactive too (never silently Active).
      const CODE_BEARING_RULE_TYPES = new Set(['Script', 'Request', 'Response']);
      const effectiveStatus = CODE_BEARING_RULE_TYPES.has(ruleType)
        ? 'Inactive'
        : (status ?? 'Inactive');

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

      const response = await fetch('https://api2.requestly.io/v1/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create rule: ${response.status} ${errorText}`,
          },
        ],
      };
    }
    const data = await response.json();
    const note =
      effectiveStatus === 'Inactive'
        ? '\n\nNOTE: This rule was created INACTIVE. A human must review the rule ' +
          '(especially any injected script/code) and explicitly activate it before it takes effect.'
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
