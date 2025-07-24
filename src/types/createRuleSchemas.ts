
import { z } from "zod";

export const SourceSchema = z.object({
  key: z.enum(['Url', 'Host', 'Path']),
  operator: z.enum(["Equals", "Contains", "Matches", "Wildcard_Matches"]),
  value: z.string(),
});

// All pair schemas...
export const RedirectPairSchema = z.object({
  source: SourceSchema,
  destinationType: z.string(),
  destination: z.string(),
});

export const CancelPairSchema = z.object({
  source: SourceSchema,
});

export const ReplacePairSchema = z.object({
  source: SourceSchema,
  from: z.string(),
  to: z.string(),
});

export const HeaderModificationSchema = z.object({
  header: z.string(),
  type: z.enum(["Add", "Remove", "Modify"]),
  value: z.string().optional(),
});

export const HeadersPairSchema = z.object({
  source: SourceSchema,
  modifications: z.object({
    Request: z.array(HeaderModificationSchema).optional(),
    Response: z.array(HeaderModificationSchema).optional(),
  }),
});

export const UserAgentPairSchema = z.object({
  source: SourceSchema,
  userAgent: z.string(),
});

export const QueryParamModificationSchema = z.object({
  param: z.string(),
  type: z.enum(["Add", "Remove", "Remove All"]),
  value: z.string().optional(),
});

export const QueryParamPairSchema = z.object({
  source: SourceSchema,
  modifications: z.array(QueryParamModificationSchema),
});

export const RequestPairSchema = z.object({
  source: SourceSchema,
  request: z.object({
    type: z.enum(["code", "static"]),
    value: z.string(),
  }),
});

export const ResponsePairSchema = z.object({
  source: SourceSchema,
  response: z.object({
    type: z.enum(["code", "static"]),
    value: z.string(),
    serveWithoutRequest: z.boolean().optional(),
  }),
});

export const DelayPairSchema = z.object({
  source: SourceSchema,
  delay: z.string().refine(val => /^\d+$/.test(val), {
    message: 'Delay must be a string containing a number',
  }),
});

// Rule type enum
export const RuleTypeEnum = z.enum([
  'Redirect',
  'Cancel',
  'Replace',
  'Headers',
  'UserAgent',
  'QueryParam',
  'Request',
  'Response',
  'Delay',
]);

// Create individual rule schemas
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
    apiKey: z.string().describe('Requestly API key (x-api-key header)'),
  });
}

// Create a more detailed schema that MCP can understand while maintaining type safety
const createMCPCompatibleSchema = () => {
  // Base fields that are common to all rules
  const baseFields = {
    name: z.string().describe('Name of the rule.'),
    description: z.string().optional().describe('Description of the rule.'),
    ruleType: z.enum([
      'Redirect',
      'Cancel', 
      'Replace',
      'Headers',
      'UserAgent',
      'QueryParam',
      'Request',
      'Response',
      'Delay',
    ]).describe('Type of the rule. This determines the structure of the pairs array.'),
    status: z
      .enum(['Active', 'Inactive'])
      .optional()
      .default('Active')
      .describe('Status of the rule.'),
    groupId: z
      .string()
      .optional()
      .describe('ID of the group the rule belongs to.'),
    apiKey: z.string().describe('Requestly API key (x-api-key header)'),
  };

  // Create detailed pair descriptions for each rule type
  const pairDescriptions = {
    Redirect: 'Array of redirect pairs. Each pair must have: source (matching criteria), destinationType (string), destination (target URL)',
    Cancel: 'Array of cancel pairs. Each pair must have: source (matching criteria to cancel requests)',
    Replace: 'Array of replace pairs. Each pair must have: source (matching criteria), from (string to replace), to (replacement string)',
    Headers: 'Array of header pairs. Each pair must have: source (matching criteria), modifications (array of header modifications with header, type, and optional value)',
    UserAgent: 'Array of user agent pairs. Each pair must have: source (matching criteria), userAgent (custom user agent string)',
    QueryParam: 'Array of query param pairs. Each pair must have: source (matching criteria), modifications (array of param modifications)',
    Request: 'Array of request pairs. Each pair must have: type ("code" or "static"), value (request content)',
    Response: 'Array of response pairs. Each pair must have: source (matching criteria), response (object with type, value, and optional serveWithoutRequest)',
    Delay: 'Array of delay pairs. Each pair must have: source (matching criteria), delay (number in milliseconds)'
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
export const ruleSchema = z.discriminatedUnion('ruleType', [
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

// Type for the validated args
export type ValidatedRuleArgs = z.infer<typeof ruleSchema>;