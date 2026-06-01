import { defineConfig } from 'vitest/config';

/**
 * Unit tests only. The Playwright e2e suite under tests/e2e is driven by
 * `npm run test:e2e` (it boots a real server) — keep it out of Vitest's globs
 * so `npm run test:unit` stays a fast, hermetic, pure-logic run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
  },
});
