import z from "zod";
import { CancelPairSchema, DelayPairSchema, HeadersPairSchema, QueryParamPairSchema, RedirectPairSchema, ReplacePairSchema, RequestPairSchema, ResponsePairSchema, RuleTypeEnum, UserAgentPairSchema } from "./ruleSchemas.js";

function createRuleSchema<T extends z.infer<typeof RuleTypeEnum>>(
  ruleType: T,
  pairSchema: z.ZodType<any>
) {
  return z.object({
    name: z.string().describe('Name of the rule.'),
    description: z.string().optional().describe('Description of the rule.'),
    ruleType: z.literal(ruleType).describe('Type of the rule.'),
    status: z
      .enum(['Active', 'Inactive'])
      .optional()
      .default('Active')
      .describe('Status of the rule.'),
    pairs: z
      .array(pairSchema)
      .describe('List of rule pair objects for the rule type.'),
    groupId: z
      .string()
      .optional()
      .describe('ID of the group the rule belongs to.'),
  });
}

// Create a more detailed schema that MCP can understand while maintaining type safety
const createMCPCompatibleSchema = () => {
  // Base fields that are common to all rules
  const baseFields = {
    name: z.string().describe('Name of the rule.'),
    description: z.string().optional().describe('Description of the rule.'),
    ruleType: z
      .enum([
        'Redirect',
        'Cancel',
        'Replace',
        'Headers',
        'UserAgent',
        'QueryParam',
        'Request',
        'Response',
        'Delay',
      ])
      .describe(
        'Type of the rule. This determines the structure of the pairs array.'
      ),
    status: z
      .enum(['Active', 'Inactive'])
      .optional()
      .default('Active')
      .describe('Status of the rule.'),
    groupId: z
      .string()
      .optional()
      .describe('ID of the group the rule belongs to.'),
  };

  // Create detailed pair descriptions for each rule type
  const pairDescriptions = {
    Redirect:
      'Array of redirect pairs. Each pair must have: source (matching criteria), destinationType (string), destination (target URL)',
    Cancel:
      'Array of cancel pairs. Each pair must have: source (matching criteria to cancel requests)',
    Replace:
      'Array of replace pairs. Each pair must have: source (matching criteria), from (string to replace), to (replacement string)',
    Headers:
      'Array of header pairs. Each pair must have: source (matching criteria), modifications (array of header modifications with header, type, and optional value)',
    UserAgent:
      'Array of user agent pairs. Each pair must have: source (matching criteria), userAgent (custom user agent string)',
    QueryParam:
      'Array of query param pairs. Each pair must have: source (matching criteria), modifications (array of param modifications)',
    Request:
      'Array of request pairs. Each pair must have: type ("code" or "static"), value (request content)',
    Response:
      'Array of response pairs. Each pair must have: source (matching criteria), response (object with type, value, and optional serveWithoutRequest)',
    Delay:
      'Array of delay pairs. Each pair must have: source (matching criteria), delay (number in milliseconds)',
  };

  return {
    ...baseFields,
    pairs: z.array(z.unknown()).describe(
      `List of rule pair objects. Structure depends on ruleType:
      
      - Redirect: ${pairDescriptions.Redirect}
      - Cancel: ${pairDescriptions.Cancel}
      - Replace: ${pairDescriptions.Replace}
      - Headers: ${pairDescriptions.Headers}
      - UserAgent: ${pairDescriptions.UserAgent}
      - QueryParam: ${pairDescriptions.QueryParam}
      - Request: ${pairDescriptions.Request}
      - Response: ${pairDescriptions.Response}
      - Delay: ${pairDescriptions.Delay}
      
      All source objects must have: key ("Url", "Host", or "Path"), operator ("Equals", "Contains", "Matches", or "Wildcard_Matches"), value (string to match against)`
    ),
  };
};

export const schema = createMCPCompatibleSchema();

// Keep the discriminated union for proper validation
const getRuleSchema = () =>
  z.discriminatedUnion('ruleType', [
    createRuleSchema('Redirect', RedirectPairSchema),
    createRuleSchema('Cancel', CancelPairSchema),
    createRuleSchema('Replace', ReplacePairSchema),
    createRuleSchema('Headers', HeadersPairSchema),
    createRuleSchema('UserAgent', UserAgentPairSchema),
    createRuleSchema('QueryParam', QueryParamPairSchema),
    createRuleSchema('Request', RequestPairSchema),
    createRuleSchema('Response', ResponsePairSchema),
    createRuleSchema('Delay', DelayPairSchema),
  ]);

export const ruleSchema = getRuleSchema();

// Type for the validated args
export type ValidatedRuleArgs = z.infer<typeof ruleSchema>;
