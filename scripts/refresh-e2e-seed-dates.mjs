#!/usr/bin/env node
/**
 * Refreshes the date-relative VROOM/route seed so the route-optimizer e2e
 * specs are reproducible on a long-lived local database.
 *
 * The seed `020_vroom_test_seed.sql` inserts 8 unassigned, geocoded jobs at
 * `current_date + 1` — i.e. "tomorrow" *as of when the seed was applied*. The
 * routes specs query for jobs scheduled `tomorrowStr()` (today + 1). On a
 * fresh CI database these agree, but on a persistent dev DB seeded days ago the
 * jobs drift into the past, auto-load finds 0 stops, and the "Optimize Routes"
 * button never enables. This script re-pins those jobs to the real tomorrow.
 *
 * Idempotent and safe: on a freshly-seeded DB it sets the date to the value it
 * already has (no-op). Refuses to run against a non-local Supabase URL.
 *
 *   node scripts/refresh-e2e-seed-dates.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnv('.env.test');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = process.env.E2E_COMPANY_ID;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test');
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`Refusing to refresh seed dates against non-local Supabase URL: ${url}`);
  process.exit(1);
}
if (!companyId) {
  console.error('Missing E2E_COMPANY_ID in .env.test');
  process.exit(1);
}

// Local YYYY-MM-DD for tomorrow — must match tomorrowStr() in the route specs.
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const tomorrow = tomorrowStr();
  // The seed leaves the route-test jobs unassigned + scheduled under the e2e
  // company; re-pin exactly those to the real tomorrow.
  const { data, error } = await admin
    .from('jobs')
    .update({ scheduled_date: tomorrow })
    .eq('company_id', companyId)
    .eq('status', 'scheduled')
    .is('crew_id', null)
    .select('id');
  if (error) {
    console.error('Refresh failed:', error.message);
    process.exit(1);
  }
  console.log(`✓ Re-pinned ${data?.length ?? 0} route-seed job(s) to ${tomorrow} (company ${companyId})`);
})().catch((err) => {
  console.error('Refresh failed:', err.message ?? err);
  process.exit(1);
});
