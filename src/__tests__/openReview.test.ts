import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * The review file is opened in the user's default text editor when the prompt
 * appears (terminals don't reliably make the path clickable). Never actually
 * launches anything here: spawn is mocked.
 */
const spawn = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

const { registerTools } = await import('../tools/index.js');

describe('opening the review file', () => {
  let home: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ['HOME', 'REQUESTLY_API_KEY', 'REQUESTLY_MCP_OPEN_REVIEW_FILE']) saved[k] = process.env[k];
    home = mkdtempSync('/tmp/rq-home-');
    process.env.HOME = home;
    process.env.REQUESTLY_API_KEY = 'test-api-key';
    spawn.mockClear();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' })) as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    rmSync(home, { recursive: true, force: true });
  });

  async function createLongScriptRule() {
    const server = new McpServer({ name: 't', version: '1' });
    registerTools(server);
    const client = new Client({ name: 'h', version: '1' }, { capabilities: { elicitation: {} } });
    let path = '';
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      path = String(req.params.message).split('\n')[1];
      return { action: 'decline' };
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    await client.callTool({
      name: 'create_rule',
      arguments: { name: 'r', ruleType: 'Script', pairs: [{ source: { key: 'Url', operator: 'Contains', value: 'x' }, scripts: [{ codeType: 'js', type: 'code', loadTime: 'afterPageLoad', value: 'a()\nb()' }] }] },
    });
    await Promise.all([client.close(), server.close()]);
    return path;
  }

  it("opens the file with the platform's default app, detached, without touching stdout", async () => {
    delete process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE;
    const path = await createLongScriptRule();
    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0] as any[];
    const expected = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    expect(cmd).toBe(expected);
    expect(args).toEqual([path]);
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' });
  });

  it('does not open anything when REQUESTLY_MCP_OPEN_REVIEW_FILE=0', async () => {
    process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE = '0';
    await createLongScriptRule();
    expect(spawn).not.toHaveBeenCalled();
  });
});
