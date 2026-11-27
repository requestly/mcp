import { describe, it, expect } from 'vitest';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Guards the setup in setup/isolateHome.ts: if it stops running, this fails. */
describe('test isolation', () => {
  it('runs each test file with its own temporary HOME, not the real one', () => {
    expect(homedir().startsWith(join(tmpdir(), 'rq-mcp-test-home-'))).toBe(true);
  });

  it('never opens the review file in an editor unless a test turns it on', () => {
    expect(process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE).toBe('0');
  });
});
