#!/usr/bin/env node
/**
 * Provision a new licensee: company row + owner account, ready to sign in.
 *
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/provision-company.mjs \
 *     --name "Green Acres Landscaping" --slug green-acres \
 *     --owner-email owner@greenacres.com --owner-name "Sam Green" \
 *     [--phone 509-555-0100] [--timezone America/Los_Angeles] [--invoice-prefix GA]
 *
 * Prints the owner's temporary password once. Idempotent on slug: re-running
 * with the same slug reuses the company and only adds a missing owner.
 * Refuses to run without an explicit SUPABASE_URL (never reads .env.local).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const required = ['name', 'slug', 'owner-email', 'owner-name'];
const missing = required.filter((k) => !args[k]);
if (!url || !key || missing.length) {
  console.error(`Missing: ${[!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY', ...missing.map((m) => `--${m}`)].filter(Boolean).join(', ')}`);
  process.exit(1);
}
if (!/^[a-z0-9-]{2,40}$/.test(args.slug)) { console.error('slug must be lowercase letters, digits, dashes'); process.exit(1); }

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing } = await admin.from('companies').select('id').eq('slug', args.slug).maybeSingle();
let companyId = existing?.id;
if (!companyId) {
  const { data, error } = await admin.from('companies').insert({
    name: args.name,
    slug: args.slug,
    phone: args.phone ?? null,
    email: args['owner-email'],
    timezone: args.timezone ?? 'America/Los_Angeles',
    invoice_prefix: args['invoice-prefix'] ?? args.slug.replace(/[^a-z]/g, '').slice(0, 4).toUpperCase() || 'INV',
  }).select('id').single();
  if (error) { console.error('company insert failed:', error.message); process.exit(1); }
  companyId = data.id;
  console.log(`✓ company ${args.name} (${companyId})`);
} else {
  console.log(`= company ${args.slug} already exists (${companyId})`);
}

const email = String(args['owner-email']).toLowerCase();
const { data: profiles } = await admin.from('profiles').select('id, role').eq('company_id', companyId).eq('role', 'owner');
const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existingUser = userList?.users.find((u) => u.email?.toLowerCase() === email);
if (existingUser && profiles?.some((p) => p.id === existingUser.id)) {
  console.log(`= owner ${email} already provisioned`);
  process.exit(0);
}

const password = randomBytes(9).toString('base64url');
let userId = existingUser?.id;
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: args['owner-name'] },
  });
  if (error) { console.error('auth user failed:', error.message); process.exit(1); }
  userId = data.user.id;
}
const { error: profileErr } = await admin.from('profiles').upsert({
  id: userId, company_id: companyId, full_name: args['owner-name'], role: 'owner', welcome_tour_completed: false,
});
if (profileErr) { console.error('profile failed:', profileErr.message); process.exit(1); }

console.log(`✓ owner ${email}`);
console.log(`\nSign-in:  ${email}\nPassword: ${existingUser ? '(unchanged — use Forgot password)' : password}\nPublic quote page: /request/${args.slug}\n`);
