import { execFileSync } from 'node:child_process';
import { loadEnvTest } from './helpers/env';

/**
 * Runs once before all projects. Provisions the dedicated e2e owner + crew
 * users (idempotent) so both the fresh-login `auth` specs and the `setup`
 * project's storage-state capture have accounts to log into, then re-pins the
 * date-relative route seed to the real tomorrow so the route-optimizer specs
 * are reproducible on a long-lived local DB. Both scripts are idempotent and
 * reuse the canonical CLI/CI path to avoid duplicated logic.
 */
export default function globalSetup() {
  loadEnvTest();
  execFileSync('node', ['scripts/seed-e2e-users.mjs'], {
    stdio: 'inherit',
    env: process.env,
  });
  execFileSync('node', ['scripts/refresh-e2e-seed-dates.mjs'], {
    stdio: 'inherit',
    env: process.env,
  });
}
