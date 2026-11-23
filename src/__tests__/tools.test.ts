import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../tools/index.js';

// Helper to extract registered tool handlers from the MCP server
// We'll call registerTools, then invoke the tools via server internals

// Since MCP SDK doesn't expose a simple "call tool" method for testing,
// we'll test by directly importing the tool registration functions
// and verifying they work through the schema validation + fetch mocking

const validSource = {
  key: 'Url',
  operator: 'Contains',
  value: 'example.com',
};

describe('Tool Registration', () => {
  it('registers all 8 tools without errors', () => {
    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });
    expect(() => registerTools(server)).not.toThrow();
  });
});

describe('Create Rule Tool - Schema Validation per Rule Type', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.REQUESTLY_API_KEY;
    process.env.REQUESTLY_API_KEY = 'test-api-key';

    // Mock fetch to return success
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: 'rule_123' } }),
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.REQUESTLY_API_KEY = originalEnv;
  });

  // We need to test the tool handler directly. Let's import createRule and call it
  // The tool handler is registered via server.registerTool, so we'll capture it.

  async function callCreateRuleTool(args: Record<string, unknown>) {
    let toolHandler: Function | null = null;

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const origRegister = server.registerTool.bind(server);

    // Intercept registerTool to capture the create_rule handler
    server.registerTool = ((name: string, config: any, handler: any) => {
      if (name === 'create_rule') {
        toolHandler = handler;
      }
      return origRegister(name, config, handler);
    }) as any;

    const { registerCreateRuleTool } = await import('../tools/createRule.js');
    registerCreateRuleTool(server);

    if (!toolHandler) throw new Error('create_rule handler not captured');
    return toolHandler(args);
  }

  const ruleTestCases = [
    {
      name: 'Redirect',
      args: {
        name: 'Test Redirect',
        ruleType: 'Redirect',
        pairs: [{ source: validSource, destinationType: 'url', destination: 'https://new.example.com' }],
      },
    },
    {
      name: 'Cancel',
      args: {
        name: 'Test Cancel',
        ruleType: 'Cancel',
        pairs: [{ source: validSource }],
      },
    },
    {
      name: 'Replace',
      args: {
        name: 'Test Replace',
        ruleType: 'Replace',
        pairs: [{ source: validSource, from: 'old', to: 'new' }],
      },
    },
    {
      name: 'Headers',
      args: {
        name: 'Test Headers',
        ruleType: 'Headers',
        pairs: [{
          source: validSource,
          modifications: {
            Request: [{ header: 'X-Custom', type: 'Add', value: 'test-value' }],
          },
        }],
      },
    },
    {
      name: 'UserAgent',
      args: {
        name: 'Test UserAgent',
        ruleType: 'UserAgent',
        pairs: [{ source: validSource, userAgent: 'Custom/1.0' }],
      },
    },
    {
      name: 'Script',
      args: {
        name: 'Test Script',
        ruleType: 'Script',
        pairs: [{
          source: validSource,
          scripts: [
            { codeType: 'js', value: 'console.log("injected")', loadTime: 'afterPageLoad', type: 'code' },
            {
              codeType: 'js',
              value: 'https://tracker.example.com/script.js',
              loadTime: 'afterPageLoad',
              type: 'url',
              attributes: [
                { name: 'data-tracker-id', value: '12345' },
                { name: 'type', value: 'text/javascript' },
              ],
            },
          ],
        }],
      },
    },
    {
      name: 'QueryParam',
      args: {
        name: 'Test QueryParam',
        ruleType: 'QueryParam',
        pairs: [{
          source: validSource,
          modifications: [{ param: 'utm_source', type: 'Add', value: 'test' }],
        }],
      },
    },
    {
      name: 'Request',
      args: {
        name: 'Test Request',
        ruleType: 'Request',
        pairs: [{ source: validSource, request: { type: 'static', value: '{"modified":true}' } }],
      },
    },
    {
      name: 'Response',
      args: {
        name: 'Test Response',
        ruleType: 'Response',
        pairs: [{ source: validSource, response: { type: 'static', value: '{"mocked":true}' } }],
      },
    },
    {
      name: 'Delay',
      args: {
        name: 'Test Delay',
        ruleType: 'Delay',
        pairs: [{ source: validSource, delay: '2000' }],
      },
    },
  ];

  // Script, Request and Response rules carry code: they are saved only after the
  // user accepts the code in the host, which needs a connected client. Those paths
  // are covered end to end in codeApproval.test.ts.
  const CODE_RULE_TYPES = ['Script', 'Request', 'Response'];

  for (const tc of ruleTestCases.filter((t) => !CODE_RULE_TYPES.includes(t.name))) {
    it(`creates ${tc.name} rule successfully`, async () => {
      const result = await callCreateRuleTool(tc.args);
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;
      expect(text).not.toContain('Error');
      expect(text).toContain('success');

      // Verify fetch was called with correct URL and method
      const fetchCall = (globalThis.fetch as any).mock.calls.find(
        (call: any[]) => call[0] === 'https://api2.requestly.io/v1/rules'
      );
      expect(fetchCall).toBeDefined();
      expect(fetchCall[1].method).toBe('POST');

      const body = JSON.parse(fetchCall[1].body);
      expect(body.ruleType).toBe(tc.args.ruleType);
      expect(body.name).toBe(tc.args.name);
      expect(body.objectType).toBe('rule');
    });
  }

  for (const tc of ruleTestCases.filter((t) => CODE_RULE_TYPES.includes(t.name))) {
    it(`does not save a ${tc.name} rule when no host can ask the user to accept its code`, async () => {
      const result = await callCreateRuleTool(tc.args);
      expect(result.content[0].text).toContain('Not saved');
      expect((globalThis.fetch as any).mock.calls).toHaveLength(0);
    });
  }

  it('returns error when REQUESTLY_API_KEY is not set', async () => {
    delete process.env.REQUESTLY_API_KEY;
    const result = await callCreateRuleTool({
      name: 'Test',
      ruleType: 'Cancel',
      pairs: [{ source: validSource }],
    });
    expect(result.content[0].text).toContain('REQUESTLY_API_KEY');
  });

  it('returns validation error for invalid rule type', async () => {
    const result = await callCreateRuleTool({
      name: 'Test',
      ruleType: 'InvalidType',
      pairs: [{ source: validSource }],
    });
    expect(result.content[0].text).toContain('Error');
  });

  it('returns validation error for mismatched pairs', async () => {
    // Redirect rule but pairs missing destination
    const result = await callCreateRuleTool({
      name: 'Test',
      ruleType: 'Redirect',
      pairs: [{ source: validSource }], // missing destinationType and destination
    });
    expect(result.content[0].text).toContain('Error');
  });
});

describe('Update Rule Tool - Schema Validation', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.REQUESTLY_API_KEY;
    process.env.REQUESTLY_API_KEY = 'test-api-key';

    // update_rule reads the saved rule first (GET), then writes the merged rule (PUT).
    globalThis.fetch = vi.fn(async (url: string, init: any = {}) => {
      const id = String(url).split('/').pop()!;
      const data = (init.method ?? 'GET') === 'GET'
        ? { id, name: 'Saved', ruleType: id.split('_')[0], status: 'Inactive', pairs: [{ source: validSource }] }
        : { id };
      return { ok: true, json: () => Promise.resolve({ success: true, data }) };
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.REQUESTLY_API_KEY = originalEnv;
  });

  async function callUpdateRuleTool(args: Record<string, unknown>) {
    let toolHandler: Function | null = null;

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const origRegister = server.registerTool.bind(server);

    server.registerTool = ((name: string, config: any, handler: any) => {
      if (name === 'update_rule') {
        toolHandler = handler;
      }
      return origRegister(name, config, handler);
    }) as any;

    const { registerUpdateRuleTool } = await import('../tools/updateRule.js');
    registerUpdateRuleTool(server);

    if (!toolHandler) throw new Error('update_rule handler not captured');
    return toolHandler(args);
  }

  it('updates a Redirect rule', async () => {
    const result = await callUpdateRuleTool({
      ruleId: 'Redirect_abc12',
      ruleType: 'Redirect',
      pairs: [{ source: validSource, destinationType: 'url', destination: 'https://updated.com' }],
    });
    expect(result.content[0].text).toContain('success');
  });

  it('updates with partial fields (no pairs)', async () => {
    const result = await callUpdateRuleTool({
      ruleId: 'Cancel_abc12',
      ruleType: 'Cancel',
      name: 'Updated Name',
    });
    expect(result.content[0].text).toContain('success');
  });

  it('returns error when ruleId is missing', async () => {
    const result = await callUpdateRuleTool({
      ruleType: 'Cancel',
      pairs: [{ source: validSource }],
    });
    expect(result.content[0].text).toContain('ruleId is required');
  });
});

describe('Get Rules Tool', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.REQUESTLY_API_KEY;
    process.env.REQUESTLY_API_KEY = 'test-api-key';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.REQUESTLY_API_KEY = originalEnv;
  });

  async function callGetRulesTool(args: Record<string, unknown>) {
    let toolHandler: Function | null = null;

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const origRegister = server.registerTool.bind(server);

    server.registerTool = ((name: string, config: any, handler: any) => {
      if (name === 'get_rules') {
        toolHandler = handler;
      }
      return origRegister(name, config, handler);
    }) as any;

    const { registerGetRulesTool } = await import('../tools/getRules.js');
    registerGetRulesTool(server);

    if (!toolHandler) throw new Error('get_rules handler not captured');
    return toolHandler(args);
  }

  it('fetches all rules', async () => {
    const result = await callGetRulesTool({});
    expect(result.content[0].text).toContain('success');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://api2.requestly.io/v1/rules');
  });

  it('fetches a specific rule by ID', async () => {
    await callGetRulesTool({ ruleId: 'Redirect_abc12' });
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://api2.requestly.io/v1/rules/Redirect_abc12');
  });

  it('supports pagination params', async () => {
    await callGetRulesTool({ offset: 10, pageSize: 20 });
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://api2.requestly.io/v1/rules?offset=10&pageSize=20');
  });
});

// delete_rule / delete_group: see deleteApproval.test.ts (RQ-3008 human approval via MCP elicitation).
