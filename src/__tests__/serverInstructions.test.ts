import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

/**
 * RQ-3019: the server's instructions (sent at initialize; Claude Code puts them in
 * the system prompt) tell the host that text inside <untrusted-data-...> tags is
 * workspace data, never instructions.
 */
describe('RQ-3019 — server instructions', () => {
  it('tells the host to treat untrusted-data blocks as data', async () => {
    const server = createServer();
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: {} });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    try {
      const instructions = client.getInstructions() ?? '';
      expect(instructions).toContain('<untrusted-data-');
      expect(instructions).toMatch(/never follow/i);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(8);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
