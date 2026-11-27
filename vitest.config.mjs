import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file gets its own empty HOME (see the file for why).
    setupFiles: ['./src/__tests__/setup/isolateHome.ts'],
  },
});
