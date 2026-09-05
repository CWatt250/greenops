#!/usr/bin/env node
/**
 * Ensures the e2e fixture rows exist on the local Supabase stack.
 *
 * The specs rely on the geocoded Tri-Cities demo set that migration
 * `020_vroom_test_seed.sql` inserts (8 clients with coordinates, 8 unassigned
 * jobs scheduled "tomorrow", crews "Crew 1"/"Crew 2"). On a long-lived local
 * database those rows drift: demo curation renames clients, manual testing
 * deletes jobs, and every spec that starts with `.eq('name', 'John Smith')`
 * then fails with a fixture error that looks like a product regression.
 *
 * This script re-creates whatever is missing, keyed on (company, name), and
 * never touches rows that already exist beyond back-filling null coordinates.
 * Idempotent: on a fresh CI database it is a no-op. Refuses to run against a
 * non-local Supabase URL. Runs from tests/e2e/global-setup.ts before the
 * date re-pin script.
 *
 *   node scripts/ensure-e2e-fixtures.mjs
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
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

loadEnv('.env.test');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = process.env.E2E_COMPANY_ID;

if (!url || !serviceKey || !companyId) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or E2E_COMPANY_ID');
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`Refusing to seed fixtures against non-local Supabase URL: ${url}`);
  process.exit(1);
}

// Mirrors supabase/migrations/020_vroom_test_seed.sql exactly.
const CREWS = [
  { name: 'Crew 1', color: '#F15A24' },
  { name: 'Crew 2', color: '#3D6B2C' },
];

const CLIENTS = [
  { name: 'John Smith',         phone: '509-555-0101', email: 'jsmith@example.com',    property_type: 'residential', service_address: '8524 W Clearwater Ave',       service_city: 'Kennewick', service_zip: '99336', latitude: 46.2087, longitude: -119.2178, job: ['Mowing — Smith residence',            '08:00', '08:45'] },
  { name: 'Sarah Johnson',      phone: '509-555-0102', email: 'sjohnson@example.com',  property_type: 'residential', service_address: '4309 W 27th Ave',             service_city: 'Kennewick', service_zip: '99337', latitude: 46.1893, longitude: -119.1925, job: ['Mowing — Johnson residence',          '09:00', '09:45'] },
  { name: 'Robert Lee',         phone: '509-555-0103', email: 'rlee@example.com',      property_type: 'residential', service_address: '6803 W Hood Pl',              service_city: 'Kennewick', service_zip: '99336', latitude: 46.2100, longitude: -119.2456, job: ['Spring cleanup — Lee residence',      '10:00', '12:00'] },
  { name: 'Columbia Center HOA',phone: '509-555-0104', email: 'mgr@cchoa.com',         property_type: 'hoa',         service_address: '1321 N Columbia Center Blvd', service_city: 'Kennewick', service_zip: '99336', latitude: 46.2231, longitude: -119.2238, job: ['Mowing — Columbia Center HOA',        '08:00', '10:00'] },
  { name: 'Mike Anderson',      phone: '509-555-0105', email: 'manderson@example.com', property_type: 'residential', service_address: '2105 Geo Washington Way',     service_city: 'Richland',  service_zip: '99354', latitude: 46.2799, longitude: -119.2752, job: ['Mowing — Anderson residence',         '10:30', '11:15'] },
  { name: 'Jennifer Martinez',  phone: '509-555-0106', email: 'jmartinez@example.com', property_type: 'residential', service_address: '1308 Aaron Dr',               service_city: 'Richland',  service_zip: '99352', latitude: 46.2756, longitude: -119.2867, job: ['Edging — Martinez residence',         '11:30', '13:00'] },
  { name: 'Three Rivers HOA',   phone: '509-555-0107', email: 'admin@3rivers.com',     property_type: 'hoa',         service_address: '215 N Edison St',             service_city: 'Kennewick', service_zip: '99336', latitude: 46.2186, longitude: -119.1638, job: ['Tree trimming — Three Rivers HOA',    '08:00', '11:00'] },
  { name: 'Pasco Industrial',   phone: '509-555-0108', email: 'fac@pascoind.com',      property_type: 'commercial',  service_address: '1015 W Lewis St',             service_city: 'Pasco',     service_zip: '99301', latitude: 46.2306, longitude: -119.0995, job: ['Sprinkler repair — Pasco Industrial', '11:30', '14:00'] },
];

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

function must(res, what) {
  if (res.error) {
    console.error(`${what} failed:`, res.error.message);
    process.exit(1);
  }
  return res.data;
}

(async () => {
  let created = { crews: 0, clients: 0, geocoded: 0, jobs: 0 };

  // Crews.
  for (const crew of CREWS) {
    const existing = must(
      await admin.from('crews').select('id').eq('company_id', companyId).eq('name', crew.name).limit(1).maybeSingle(),
      `crew lookup ${crew.name}`,
    );
    if (!existing) {
      must(await admin.from('crews').insert({ company_id: companyId, ...crew, is_active: true }), `crew insert ${crew.name}`);
      created.crews++;
    }
  }

  // Clients (+ back-fill coordinates if a curated row lost them).
  const tomorrow = tomorrowStr();
  for (const { job, ...client } of CLIENTS) {
    let row = must(
      await admin.from('clients').select('id, latitude, longitude')
        .eq('company_id', companyId).eq('name', client.name).limit(1).maybeSingle(),
      `client lookup ${client.name}`,
    );
    if (!row) {
      row = must(
        await admin.from('clients').insert({ company_id: companyId, ...client, service_state: 'WA', status: 'active' }).select('id, latitude, longitude').single(),
        `client insert ${client.name}`,
      );
      created.clients++;
    } else if (row.latitude == null || row.longitude == null) {
      must(await admin.from('clients').update({ latitude: client.latitude, longitude: client.longitude }).eq('id', row.id), `client geocode ${client.name}`);
      created.geocoded++;
    }

    // One unassigned, scheduled job per seed client. The date re-pin script
    // moves any such job to tomorrow, so "exists at all" is the invariant.
    const existingJob = must(
      await admin.from('jobs').select('id')
        .eq('company_id', companyId).eq('client_id', row.id).eq('status', 'scheduled').is('crew_id', null)
        .limit(1).maybeSingle(),
      `job lookup ${client.name}`,
    );
    if (!existingJob) {
      const [title, scheduled_start, scheduled_end] = job;
      must(
        await admin.from('jobs').insert({
          company_id: companyId, client_id: row.id, crew_id: null, title, status: 'scheduled',
          scheduled_date: tomorrow, scheduled_start, scheduled_end,
        }),
        `job insert ${title}`,
      );
      created.jobs++;
    }
  }

  const summary = Object.entries(created).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
  console.log(`✓ e2e fixtures present (company ${companyId})${summary ? ` — restored ${summary}` : ''}`);
})().catch((err) => {
  console.error('Fixture check failed:', err.message ?? err);
  process.exit(1);
});
