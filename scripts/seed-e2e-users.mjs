#!/usr/bin/env node
/**
 * Provisions the dedicated end-to-end test users in the *local* Supabase auth
 * schema, plus their `profiles` rows (role + company_id). Idempotent: re-running
 * just re-asserts the password and profile, so it is safe in CI before tests.
 *
 *   node scripts/seed-e2e-users.mjs
 *
 * Reads config from .env.test. Refuses to run against a non-local Supabase URL
 * so it can never create users in the production project.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env parser — load .env.test into process.env (without overriding
// anything already set in the real environment, e.g. CI secrets).
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
    let val = m[2].replace(/^["']|["']$/g, '');
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

// Safety rail: only ever provision against a local Supabase instance.
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`Refusing to seed users against non-local Supabase URL: ${url}`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: process.env.E2E_OWNER_EMAIL,
    password: process.env.E2E_OWNER_PASSWORD,
    role: 'owner',
    full_name: 'E2E Owner',
  },
  {
    email: process.env.E2E_CREW_EMAIL,
    password: process.env.E2E_CREW_PASSWORD,
    role: 'crew',
    full_name: 'E2E Crew',
  },
];

async function findUserByEmail(email) {
  // Paginate listUsers (local datasets are tiny, one page is plenty).
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureUser({ email, password, role, full_name }) {
  if (!email || !password) {
    throw new Error(`Missing email/password env for role=${role}`);
  }
  let user = await findUserByEmail(email);

  if (user) {
    // Re-assert the password + confirmed status so the login is deterministic.
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }

  // Upsert the profile (role drives the proxy/layout redirects).
  const { error: pErr } = await admin
    .from('profiles')
    .upsert(
      // welcome_tour_completed:true suppresses the first-login tour modal that
      // otherwise intercepts pointer events and blocks the e2e flows.
      { id: user.id, company_id: companyId, role, full_name, welcome_tour_completed: true },
      { onConflict: 'id' },
    );
  if (pErr) throw pErr;

  console.log(`✓ ${role.padEnd(6)} ${email}  (${user.id})`);
  return user;
}

(async () => {
  console.log(`Seeding e2e users into ${url} (company ${companyId})`);
  for (const u of USERS) {
    await ensureUser(u);
  }
  console.log('Done.');
})().catch((err) => {
  console.error('Seed failed:', err.message ?? err);
  process.exit(1);
});
