import { z } from 'zod';

export const SourceSchema = z.object({
  key: z.enum(['Url', 'Host', 'Path']).describe('Source key for matching: Url, Host, or Path.'),
  operator: z.enum(['Equals', 'Contains', 'Matches', 'Wildcard_Matches']).describe('Operator for matching: Equals, Contains, Matches, or Wildcard_Matches.'),
  value: z.string().describe('Value to match against.'),
  filters: z.array(
    z.object({
      requestMethod: z.array(z.string()).optional().describe('Array of allowed HTTP methods for matching.'),
      requestPayload: z.object({
        key: z.string().describe('Key in the request payload.'),
        value: z.string().describe('Value for the request payload key.'),
      }).optional().describe('Request payload filter.'),
    })
  ).optional().describe('Array of filter objects for advanced matching.'),
}).describe('Source matching criteria for a rule.');

// All pair schemas...
export const RedirectPairSchema = z.object({
  source: SourceSchema,
  destinationType: z.string().describe('Type of destination for redirect.'),
  destination: z.string().describe('Target URL for redirect.'),
}).describe('Redirect rule pair: source and destination info.');

export const CancelPairSchema = z.object({
  source: SourceSchema,
}).describe('Cancel rule pair: source info only.');

export const ReplacePairSchema = z.object({
  source: SourceSchema,
  from: z.string().describe('String to replace.'),
  to: z.string().describe('Replacement string.'),
}).describe('Replace rule pair: source, from, and to info.');

export const HeaderModificationSchema = z.object({
  header: z.string().describe('Header name to modify.'),
  type: z.enum(['Add', 'Remove', 'Modify']).describe('Modification type: Add, Remove, or Modify.'),
  value: z.string().optional().describe('Optional value for header modification.'),
}).describe('Header modification details.');

export const HeadersPairSchema = z.object({
  source: SourceSchema,
  modifications: z.object({
    Request: z.array(HeaderModificationSchema).optional().describe('Request header modifications.'),
    Response: z.array(HeaderModificationSchema).optional().describe('Response header modifications.'),
  }).describe('Header modifications for request/response.'),
}).describe('Headers rule pair: source and modifications.');

export const UserAgentPairSchema = z.object({
  source: SourceSchema,
  userAgent: z.string().describe('Custom user agent string.'),
}).describe('User agent rule pair: source and user agent.');

export const QueryParamModificationSchema = z.object({
  param: z.string().describe('Query parameter name.'),
  type: z.enum(['Add', 'Remove', 'Remove All']).describe('Modification type for query param.'),
  value: z.string().optional().describe('Optional value for query param modification.'),
}).describe('Query parameter modification details.');

export const QueryParamPairSchema = z.object({
  source: SourceSchema,
  modifications: z.array(QueryParamModificationSchema).describe('Array of query parameter modifications.'),
}).describe('Query parameter rule pair: source and modifications.');

export const RequestPairSchema = z.object({
  source: SourceSchema,
  request: z.object({
    type: z.enum(['code', 'static']).describe('Request type: code or static.'),
    value: z.string().describe('Request content.'),
  }).describe('Request details.'),
}).describe('Request rule pair: source and request.');

export const ResponsePairSchema = z.object({
  source: SourceSchema,
  response: z.object({
    type: z.enum(['code', 'static']).describe('Response type: code or static.'),
    value: z.string().describe('Response content.'),
    resourceType: z.string().optional().describe('Optional resource type for response.'),
    statusCode: z.union([z.string(), z.number()]).optional().describe('Optional status code for response.'),
    statusText: z.string().optional().describe('Optional status text for response.'),
    serveWithoutRequest: z.boolean().optional().describe('Whether to serve response without request.'),
  }).describe('Response details.'),
}).describe('Response rule pair: source and response.');

export const DelayPairSchema = z.object({
  source: SourceSchema,
  delay: z.string().refine((val) => /^\d+$/.test(val), {
    message: 'Delay must be a string containing a number',
  }).describe('Delay value in milliseconds (stringified number).'),
}).describe('Delay rule pair: source and delay.');

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
]).describe('Enumeration of all supported rule types.');