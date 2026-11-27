import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

/**
 * Runs before every test file. The code-approval prompt writes the code under
 * review to ~/.requestly-mcp/review and opens that file in the user's text
 * editor. Without this, a test that reaches the prompt writes into the
 * developer's real home folder and opens an editor window on their machine.
 *
 * So each test file gets its own empty HOME, removed when the file finishes,
 * and opening the review file is off. A test that checks the opener
 * (openReview.test.ts) turns it back on itself, with spawn mocked.
 */
const saved = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE, // what os.homedir() reads on Windows
  REQUESTLY_MCP_OPEN_REVIEW_FILE: process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE,
};

const home = mkdtempSync(join(tmpdir(), 'rq-mcp-test-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE = '0';

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(home, { recursive: true, force: true });
});
