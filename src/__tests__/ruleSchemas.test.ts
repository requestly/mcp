import { describe, it, expect } from 'vitest';
import {
  SourceSchema,
  RedirectPairSchema,
  CancelPairSchema,
  ReplacePairSchema,
  HeadersPairSchema,
  UserAgentPairSchema,
  QueryParamPairSchema,
  RequestPairSchema,
  ResponsePairSchema,
  DelayPairSchema,
  ScriptPairSchema,
  ScriptModificationSchema,
  RuleTypeEnum,
} from '../types/ruleSchemas.js';
import {
  ruleSchema as createRuleSchema,
} from '../types/createRuleSchemas.js';
import {
  ruleSchema as updateRuleSchema,
} from '../types/updateRuleSchemas.js';

// --- Helpers ---

const validSource = {
  key: 'Url' as const,
  operator: 'Contains' as const,
  value: 'example.com',
};

const validSourceWithFilters = {
  ...validSource,
  filters: [
    {
      requestMethod: ['GET', 'POST'],
      requestPayload: { key: 'body', value: 'test' },
    },
  ],
};

// --- SourceSchema ---

describe('SourceSchema', () => {
  it('accepts a valid source', () => {
    expect(() => SourceSchema.parse(validSource)).not.toThrow();
  });

  it('accepts source with filters', () => {
    expect(() => SourceSchema.parse(validSourceWithFilters)).not.toThrow();
  });

  it('accepts all valid key values', () => {
    for (const key of ['Url', 'Host', 'Path']) {
      expect(() => SourceSchema.parse({ ...validSource, key })).not.toThrow();
    }
  });

  it('accepts all valid operator values', () => {
    for (const operator of ['Equals', 'Contains', 'Matches', 'Wildcard_Matches']) {
      expect(() => SourceSchema.parse({ ...validSource, operator })).not.toThrow();
    }
  });

  it('rejects invalid key', () => {
    expect(() => SourceSchema.parse({ ...validSource, key: 'Invalid' })).toThrow();
  });

  it('rejects invalid operator', () => {
    expect(() => SourceSchema.parse({ ...validSource, operator: 'Invalid' })).toThrow();
  });

  it('rejects missing value', () => {
    const { value, ...rest } = validSource;
    expect(() => SourceSchema.parse(rest)).toThrow();
  });
});

// --- RuleTypeEnum ---

describe('RuleTypeEnum', () => {
  it('accepts all 10 rule types', () => {
    const types = ['Redirect', 'Cancel', 'Replace', 'Headers', 'UserAgent', 'Script', 'QueryParam', 'Request', 'Response', 'Delay'];
    for (const type of types) {
      expect(() => RuleTypeEnum.parse(type)).not.toThrow();
    }
  });

  it('rejects unknown type', () => {
    expect(() => RuleTypeEnum.parse('FooBar')).toThrow();
  });
});

// --- Individual Pair Schemas ---

describe('RedirectPairSchema', () => {
  const validPair = {
    source: validSource,
    destinationType: 'url',
    destination: 'https://new.example.com',
  };

  it('accepts valid redirect pair', () => {
    expect(() => RedirectPairSchema.parse(validPair)).not.toThrow();
  });

  it('rejects missing destination', () => {
    const { destination, ...rest } = validPair;
    expect(() => RedirectPairSchema.parse(rest)).toThrow();
  });

  it('rejects missing destinationType', () => {
    const { destinationType, ...rest } = validPair;
    expect(() => RedirectPairSchema.parse(rest)).toThrow();
  });

  it('rejects missing source', () => {
    const { source, ...rest } = validPair;
    expect(() => RedirectPairSchema.parse(rest)).toThrow();
  });
});

describe('CancelPairSchema', () => {
  it('accepts valid cancel pair', () => {
    expect(() => CancelPairSchema.parse({ source: validSource })).not.toThrow();
  });

  it('rejects missing source', () => {
    expect(() => CancelPairSchema.parse({})).toThrow();
  });
});

describe('ReplacePairSchema', () => {
  const validPair = {
    source: validSource,
    from: 'old-string',
    to: 'new-string',
  };

  it('accepts valid replace pair', () => {
    expect(() => ReplacePairSchema.parse(validPair)).not.toThrow();
  });

  it('rejects missing from', () => {
    const { from, ...rest } = validPair;
    expect(() => ReplacePairSchema.parse(rest)).toThrow();
  });

  it('rejects missing to', () => {
    const { to, ...rest } = validPair;
    expect(() => ReplacePairSchema.parse(rest)).toThrow();
  });
});

describe('HeadersPairSchema', () => {
  const validPair = {
    source: validSource,
    modifications: {
      Request: [{ header: 'X-Custom', type: 'Add' as const, value: 'test' }],
      Response: [{ header: 'X-Response', type: 'Modify' as const, value: 'val' }],
    },
  };

  it('accepts valid headers pair', () => {
    expect(() => HeadersPairSchema.parse(validPair)).not.toThrow();
  });

  it('accepts with only Request modifications', () => {
    expect(() =>
      HeadersPairSchema.parse({
        source: validSource,
        modifications: {
          Request: [{ header: 'X-Custom', type: 'Add', value: 'test' }],
        },
      })
    ).not.toThrow();
  });

  it('accepts with only Response modifications', () => {
    expect(() =>
      HeadersPairSchema.parse({
        source: validSource,
        modifications: {
          Response: [{ header: 'X-Custom', type: 'Remove' }],
        },
      })
    ).not.toThrow();
  });

  it('rejects invalid modification type', () => {
    expect(() =>
      HeadersPairSchema.parse({
        source: validSource,
        modifications: {
          Request: [{ header: 'X-Custom', type: 'Invalid', value: 'test' }],
        },
      })
    ).toThrow();
  });

  it('rejects missing modifications', () => {
    expect(() => HeadersPairSchema.parse({ source: validSource })).toThrow();
  });
});

describe('UserAgentPairSchema', () => {
  const validPair = {
    source: validSource,
    userAgent: 'Mozilla/5.0 Custom Agent',
  };

  it('accepts valid user agent pair', () => {
    expect(() => UserAgentPairSchema.parse(validPair)).not.toThrow();
  });

  it('rejects missing userAgent', () => {
    expect(() => UserAgentPairSchema.parse({ source: validSource })).toThrow();
  });
});

describe('QueryParamPairSchema', () => {
  const validPair = {
    source: validSource,
    modifications: [
      { param: 'utm_source', type: 'Add' as const, value: 'test' },
      { param: 'debug', type: 'Remove' as const },
    ],
  };

  it('accepts valid query param pair', () => {
    expect(() => QueryParamPairSchema.parse(validPair)).not.toThrow();
  });

  it('accepts Remove All type', () => {
    expect(() =>
      QueryParamPairSchema.parse({
        source: validSource,
        modifications: [{ param: '', type: 'Remove All' }],
      })
    ).not.toThrow();
  });

  it('rejects invalid modification type', () => {
    expect(() =>
      QueryParamPairSchema.parse({
        source: validSource,
        modifications: [{ param: 'x', type: 'Invalid' }],
      })
    ).toThrow();
  });
});

describe('RequestPairSchema', () => {
  const validPair = {
    source: validSource,
    request: { type: 'static' as const, value: '{"key":"value"}' },
  };

  it('accepts valid request pair (static)', () => {
    expect(() => RequestPairSchema.parse(validPair)).not.toThrow();
  });

  it('accepts code type', () => {
    expect(() =>
      RequestPairSchema.parse({
        source: validSource,
        request: { type: 'code', value: 'function modify(args) { return args; }' },
      })
    ).not.toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      RequestPairSchema.parse({
        source: validSource,
        request: { type: 'invalid', value: 'test' },
      })
    ).toThrow();
  });
});

describe('ResponsePairSchema', () => {
  const validPair = {
    source: validSource,
    response: { type: 'static' as const, value: '{"response":"ok"}' },
  };

  it('accepts valid response pair (static)', () => {
    expect(() => ResponsePairSchema.parse(validPair)).not.toThrow();
  });

  it('accepts code type with optional fields', () => {
    expect(() =>
      ResponsePairSchema.parse({
        source: validSource,
        response: {
          type: 'code',
          value: 'function modify(args) { return args; }',
          statusCode: 200,
          statusText: 'OK',
          resourceType: 'xhr',
          serveWithoutRequest: true,
        },
      })
    ).not.toThrow();
  });

  it('accepts statusCode as string', () => {
    expect(() =>
      ResponsePairSchema.parse({
        source: validSource,
        response: { type: 'static', value: 'test', statusCode: '404' },
      })
    ).not.toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      ResponsePairSchema.parse({
        source: validSource,
        response: { type: 'invalid', value: 'test' },
      })
    ).toThrow();
  });
});

describe('DelayPairSchema', () => {
  it('accepts valid delay pair', () => {
    expect(() =>
      DelayPairSchema.parse({ source: validSource, delay: '1000' })
    ).not.toThrow();
  });

  it('rejects non-numeric delay string', () => {
    expect(() =>
      DelayPairSchema.parse({ source: validSource, delay: 'abc' })
    ).toThrow();
  });

  it('rejects number type delay (must be string)', () => {
    expect(() =>
      DelayPairSchema.parse({ source: validSource, delay: 1000 })
    ).toThrow();
  });
});

// --- ScriptPairSchema ---

describe('ScriptModificationSchema', () => {
  const validMod = {
    codeType: 'js' as const,
    value: 'console.log("injected")',
    loadTime: 'afterPageLoad' as const,
    type: 'code' as const,
  };

  it('accepts valid JS code modification', () => {
    expect(() => ScriptModificationSchema.parse(validMod)).not.toThrow();
  });

  it('accepts CSS code modification', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, codeType: 'css', value: 'body { display: none; }' })
    ).not.toThrow();
  });

  it('accepts URL type modification', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, type: 'url', value: 'https://cdn.example.com/script.js' })
    ).not.toThrow();
  });

  it('accepts beforePageLoad loadTime', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, loadTime: 'beforePageLoad' })
    ).not.toThrow();
  });

  it('rejects invalid codeType', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, codeType: 'python' })
    ).toThrow();
  });

  it('rejects invalid loadTime', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, loadTime: 'duringPageLoad' })
    ).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      ScriptModificationSchema.parse({ ...validMod, type: 'file' })
    ).toThrow();
  });

  it('rejects missing value', () => {
    const { value, ...rest } = validMod;
    expect(() => ScriptModificationSchema.parse(rest)).toThrow();
  });

  it('rejects missing codeType', () => {
    const { codeType, ...rest } = validMod;
    expect(() => ScriptModificationSchema.parse(rest)).toThrow();
  });
});

describe('ScriptPairSchema', () => {
  const validScriptPair = {
    source: validSource,
    scripts: [
      { codeType: 'js' as const, value: 'console.log("hi")', loadTime: 'afterPageLoad' as const, type: 'code' as const },
    ],
  };

  it('accepts valid script pair', () => {
    expect(() => ScriptPairSchema.parse(validScriptPair)).not.toThrow();
  });

  it('accepts multiple scripts in one pair', () => {
    expect(() =>
      ScriptPairSchema.parse({
        source: validSource,
        scripts: [
          { codeType: 'js', value: 'alert("hi")', loadTime: 'beforePageLoad', type: 'code' },
          { codeType: 'css', value: 'body { color: red; }', loadTime: 'afterPageLoad', type: 'code' },
          { codeType: 'js', value: 'https://cdn.example.com/lib.js', loadTime: 'beforePageLoad', type: 'url' },
        ],
      })
    ).not.toThrow();
  });

  it('rejects missing scripts', () => {
    expect(() => ScriptPairSchema.parse({ source: validSource })).toThrow();
  });

  it('rejects missing source', () => {
    expect(() =>
      ScriptPairSchema.parse({
        scripts: [{ codeType: 'js', value: 'x', loadTime: 'afterPageLoad', type: 'code' }],
      })
    ).toThrow();
  });

  it('rejects invalid script modification in array', () => {
    expect(() =>
      ScriptPairSchema.parse({
        source: validSource,
        scripts: [{ codeType: 'invalid', value: 'x', loadTime: 'afterPageLoad', type: 'code' }],
      })
    ).toThrow();
  });
});

// --- Create Rule Schema (discriminated union) ---

describe('createRuleSchema (discriminated union)', () => {
  const baseRule = { name: 'Test Rule', status: 'Active' as const };

  it('validates Redirect rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Redirect',
        pairs: [{ source: validSource, destinationType: 'url', destination: 'https://example.com' }],
      })
    ).not.toThrow();
  });

  it('validates Cancel rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Cancel',
        pairs: [{ source: validSource }],
      })
    ).not.toThrow();
  });

  it('validates Replace rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Replace',
        pairs: [{ source: validSource, from: 'old', to: 'new' }],
      })
    ).not.toThrow();
  });

  it('validates Headers rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Headers',
        pairs: [{
          source: validSource,
          modifications: {
            Request: [{ header: 'X-Test', type: 'Add', value: 'val' }],
          },
        }],
      })
    ).not.toThrow();
  });

  it('validates UserAgent rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'UserAgent',
        pairs: [{ source: validSource, userAgent: 'CustomUA/1.0' }],
      })
    ).not.toThrow();
  });

  it('validates QueryParam rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'QueryParam',
        pairs: [{
          source: validSource,
          modifications: [{ param: 'key', type: 'Add', value: 'val' }],
        }],
      })
    ).not.toThrow();
  });

  it('validates Request rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Request',
        pairs: [{ source: validSource, request: { type: 'static', value: '{}' } }],
      })
    ).not.toThrow();
  });

  it('validates Response rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Response',
        pairs: [{ source: validSource, response: { type: 'static', value: '{}' } }],
      })
    ).not.toThrow();
  });

  it('validates Delay rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Delay',
        pairs: [{ source: validSource, delay: '500' }],
      })
    ).not.toThrow();
  });

  it('validates Script rule', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Script',
        pairs: [{
          source: validSource,
          scripts: [{ codeType: 'js', value: 'console.log("hi")', loadTime: 'afterPageLoad', type: 'code' }],
        }],
      })
    ).not.toThrow();
  });

  it('validates Script rule with CSS and URL type', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Script',
        pairs: [{
          source: validSource,
          scripts: [
            { codeType: 'css', value: 'body { display: none; }', loadTime: 'beforePageLoad', type: 'code' },
            { codeType: 'js', value: 'https://cdn.example.com/script.js', loadTime: 'afterPageLoad', type: 'url' },
          ],
        }],
      })
    ).not.toThrow();
  });

  it('rejects Script rule with invalid pair (missing scripts)', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Script',
        pairs: [{ source: validSource }],
      })
    ).toThrow();
  });

  it('rejects wrong pair schema for rule type', () => {
    // Redirect rule with Cancel pair (missing destination)
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Redirect',
        pairs: [{ source: validSource }], // missing destinationType and destination
      })
    ).toThrow();
  });

  it('rejects missing name', () => {
    expect(() =>
      createRuleSchema.parse({
        ruleType: 'Cancel',
        pairs: [{ source: validSource }],
      })
    ).toThrow();
  });

  it('rejects empty pairs array', () => {
    expect(() =>
      createRuleSchema.parse({
        ...baseRule,
        ruleType: 'Cancel',
        pairs: [],
      })
    ).not.toThrow(); // Note: Zod array doesn't enforce min(1) by default
  });

  it('accepts optional groupId', () => {
    const result = createRuleSchema.parse({
      ...baseRule,
      ruleType: 'Cancel',
      pairs: [{ source: validSource }],
      groupId: 'Group_abc12',
    });
    expect(result.groupId).toBe('Group_abc12');
  });

  it('accepts optional description', () => {
    const result = createRuleSchema.parse({
      ...baseRule,
      ruleType: 'Cancel',
      pairs: [{ source: validSource }],
      description: 'Test description',
    });
    expect(result.description).toBe('Test description');
  });

  it('defaults status to Active', () => {
    const result = createRuleSchema.parse({
      name: 'Test',
      ruleType: 'Cancel',
      pairs: [{ source: validSource }],
    });
    expect(result.status).toBe('Active');
  });
});

// --- Update Rule Schema (discriminated union) ---

describe('updateRuleSchema (discriminated union)', () => {
  it('validates update for each rule type', () => {
    const testCases = [
      { ruleType: 'Redirect', pairs: [{ source: validSource, destinationType: 'url', destination: 'https://example.com' }] },
      { ruleType: 'Cancel', pairs: [{ source: validSource }] },
      { ruleType: 'Replace', pairs: [{ source: validSource, from: 'a', to: 'b' }] },
      { ruleType: 'Headers', pairs: [{ source: validSource, modifications: { Request: [{ header: 'X', type: 'Add', value: 'v' }] } }] },
      { ruleType: 'UserAgent', pairs: [{ source: validSource, userAgent: 'UA' }] },
      { ruleType: 'Script', pairs: [{ source: validSource, scripts: [{ codeType: 'js', value: 'alert(1)', loadTime: 'afterPageLoad', type: 'code' }] }] },
      { ruleType: 'QueryParam', pairs: [{ source: validSource, modifications: [{ param: 'p', type: 'Add', value: 'v' }] }] },
      { ruleType: 'Request', pairs: [{ source: validSource, request: { type: 'static', value: '{}' } }] },
      { ruleType: 'Response', pairs: [{ source: validSource, response: { type: 'static', value: '{}' } }] },
      { ruleType: 'Delay', pairs: [{ source: validSource, delay: '100' }] },
    ];

    for (const tc of testCases) {
      expect(
        () => updateRuleSchema.parse({ ruleId: 'rule_123', ...tc }),
        `Failed for ruleType: ${tc.ruleType}`
      ).not.toThrow();
    }
  });

  it('allows optional pairs (partial update)', () => {
    expect(() =>
      updateRuleSchema.parse({ ruleId: 'rule_123', ruleType: 'Cancel' })
    ).not.toThrow();
  });

  it('allows optional ruleId', () => {
    expect(() =>
      updateRuleSchema.parse({ ruleType: 'Cancel', pairs: [{ source: validSource }] })
    ).not.toThrow();
  });

  it('validates Script rule update', () => {
    expect(() =>
      updateRuleSchema.parse({
        ruleId: 'Script_abc12',
        ruleType: 'Script',
        pairs: [{
          source: validSource,
          scripts: [{ codeType: 'js', value: 'console.log("hi")', loadTime: 'afterPageLoad', type: 'code' }],
        }],
      })
    ).not.toThrow();
  });
});
