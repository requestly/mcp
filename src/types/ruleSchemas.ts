import { z } from 'zod';

export const SourceSchema = z.object({
  key: z.enum(['Url', 'Host', 'Path']),
  operator: z.enum(['Equals', 'Contains', 'Matches', 'Wildcard_Matches']),
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
  type: z.enum(['Add', 'Remove', 'Modify']),
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
  type: z.enum(['Add', 'Remove', 'Remove All']),
  value: z.string().optional(),
});

export const QueryParamPairSchema = z.object({
  source: SourceSchema,
  modifications: z.array(QueryParamModificationSchema),
});

export const RequestPairSchema = z.object({
  source: SourceSchema,
  request: z.object({
    type: z.enum(['code', 'static']),
    value: z.string(),
  }),
});

export const ResponsePairSchema = z.object({
  source: SourceSchema,
  response: z.object({
    type: z.enum(['code', 'static']),
    value: z.string(),
    serveWithoutRequest: z.boolean().optional(),
  }),
});

export const DelayPairSchema = z.object({
  source: SourceSchema,
  delay: z.string().refine((val) => /^\d+$/.test(val), {
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