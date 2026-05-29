import { defineConfig, devices } from '@playwright/test';
import { loadEnvTest } from './tests/e2e/helpers/env';

/**
 * Playwright e2e config for the TLC Management Platform.
 *
 * The suite runs against a LOCAL dev server that Playwright boots itself, wired
 * to a LOCAL Supabase stack (`supabase start`) — never the production project.
 * `.env.test` supplies the local Supabase URL/keys and the e2e user creds; we
 * load it here and inject the relevant vars into the spawned `next dev` so the
 * app talks to local Supabase even though `.env.local` points at production
 * (real env vars take precedence over `.env.local` in Next.js).
 */
const env = loadEnvTest();

// Default to 3000 (as documented), but allow an override so the suite doesn't
// collide with a dev server you already have running on 3000. See TESTING.md.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github'], ['list']] : [['html'], ['list']],

  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  // Ensures the e2e owner/crew users exist before any project runs.
  globalSetup: './tests/e2e/global-setup.ts',

  projects: [
    // 1. Authenticate the owner once; reused by the `app` project below.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // 2. Auth flow tests log in fresh (the proxy bounces already-authed users
    //    away from /login), so they run WITHOUT a stored session.
    {
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // 3. Everything else reuses the owner session captured by `setup`.
    {
      name: 'app',
      testIgnore: [/.*\.setup\.ts/, /auth\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/owner.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    // Inject local-Supabase config. These override the production values in
    // `.env.local` because process.env wins in Next's env load order.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_MAPBOX_TOKEN: env.NEXT_PUBLIC_MAPBOX_TOKEN ?? 'pk.placeholder',
      ORS_API_KEY: env.ORS_API_KEY ?? '',
    },
  },
});
