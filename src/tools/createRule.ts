import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ruleSchema, schema, ValidatedRuleArgs } from "../types/createRuleSchemas.js";

export function registerCreateRuleTool(server: McpServer) {
  server.registerTool(
  'create_rule',
  {
    title: 'Create Rule',
    description:
      'This endpoint allows you to create various types of rules in Requestly, such as Redirect, Cancel, Replace, Headers, User-Agent, Query Param, Modify Request, Modify Response, and Delay. Each rule has a specific structure and parameters based on the ruleType.',
    inputSchema: schema,
  },
  async (args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    try {
      // Validate the full request using our discriminated union schema
      const validatedArgs: ValidatedRuleArgs = ruleSchema.parse(args);
      
      const { name, description, apiKey, ruleType, status, pairs, groupId } = validatedArgs;
    const body: Record<string, unknown> = {
      name,
      objectType: 'rule',
      status: status || 'Active',
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
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
