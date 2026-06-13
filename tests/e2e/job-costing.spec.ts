import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';
import { CREW } from './helpers/creds';

/**
 * Job costing end to end (migration 014 + the 2026-06 honest-margin pass).
 *
 * The job-detail Costing tab computes actuals LIVE from clock_events +
 * crew_members rates + job_cost_entries, so we seed those via a service-role
 * client and assert the rendered labor/materials/overhead/profit/margin — plus
 * the two correctness guards: no-cost-data and rate-not-set must show "—",
 * never a fabricated margin. Serial: the tests share the e2e crew member's
 * rate row.
 */
test.describe.configure({ mode: 'serial' });

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const COMPANY = env.E2E_COMPANY_ID;

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`job-costing setup: ${what} — ${res.error.message}`);
  return res.data;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

let crewProfileId: string;
let crewId: string;
let clientId: string;

test.beforeAll(async () => {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = list.users.find((x) => x.email?.toLowerCase() === CREW.email.toLowerCase());
  expect(u, 'seeded crew user must exist').toBeTruthy();
  crewProfileId = u!.id;

  const crews = must(
    await admin.from('crews').select('id, name').eq('company_id', COMPANY),
    'crews lookup',
  ) as Array<{ id: string; name: string }>;
  crewId = (crews.find((c) => c.name === 'Crew 1') ?? crews[0]).id;

  const client = must(
    await admin.from('clients').select('id').eq('company_id', COMPANY).limit(1).maybeSingle(),
    'client lookup',
  ) as { id: string } | null;
  expect(client, 'a seeded client must exist').toBeTruthy();
  clientId = client!.id;
});

test.afterAll(async () => {
  // Restore the crew member to the schema default so other specs/runs are unaffected.
  await admin.from('crew_members').update({ hourly_rate: 25, labor_burden_pct: 25 }).eq('profile_id', crewProfileId);
});

async function setCrewRate(rate: number | null, burden: number | null) {
  must(
    await admin.from('crew_members').update({ hourly_rate: rate, labor_burden_pct: burden }).eq('profile_id', crewProfileId),
    'set crew rate',
  );
}

async function makeJob(opts: { revenue: number; title: string; status?: string }): Promise<string> {
  const job = must(
    await admin.from('jobs').insert({
      company_id: COMPANY,
      client_id: clientId,
      crew_id: crewId,
      title: opts.title,
      status: opts.status ?? 'complete',
      scheduled_date: todayStr(),
      revenue: opts.revenue,
    }).select('id').single(),
    'job insert',
  ) as { id: string };
  return job.id;
}

async function clockHours(jobId: string, hours: number) {
  const start = new Date(Date.now() - (hours + 1) * 3_600_000);
  const end = new Date(start.getTime() + hours * 3_600_000);
  must(
    await admin.from('clock_events').insert([
      { company_id: COMPANY, job_id: jobId, profile_id: crewProfileId, event_type: 'clock_in', created_at: start.toISOString() },
      { company_id: COMPANY, job_id: jobId, profile_id: crewProfileId, event_type: 'clock_out', created_at: end.toISOString() },
    ]),
    'clock events insert',
  );
}

async function addMaterial(jobId: string, description: string, qty: number, unitCost: number) {
  must(
    await admin.from('job_cost_entries').insert({
      company_id: COMPANY, job_id: jobId, category: 'material', description, quantity: qty, unit_cost: unitCost,
    }),
    'cost entry insert',
  );
}

async function cleanupJob(jobId: string) {
  await admin.from('clock_events').delete().eq('job_id', jobId);
  await admin.from('job_cost_entries').delete().eq('job_id', jobId);
  await admin.from('jobs').delete().eq('id', jobId);
}

test('job detail shows correct labor + materials + overhead, profit and margin', async ({ page }) => {
  test.setTimeout(60_000);
  await setCrewRate(40, 50); // $40/hr, 50% burden → effective $60/hr
  const jobId = await makeJob({ revenue: 500, title: `E2E Costing Full ${Date.now()}` });
  await clockHours(jobId, 2);            // 2h × 40 × 1.5 = $120 labor
  await addMaterial(jobId, 'mulch', 2, 30); // 2 × $30 = $60 materials

  try {
    await page.goto(`/dashboard/jobs/${jobId}`);
    // Labor: $120.00, Materials: $60.00, Overhead: (180)×15% = $27.00
    await expect(page.getByTestId('costing-actual-labor')).toHaveText('$120.00', { timeout: 20_000 });
    await expect(page.getByTestId('costing-actual-materials')).toHaveText('$60.00');
    await expect(page.getByTestId('costing-actual-overhead')).toHaveText('$27.00');
    // Total = 207, profit = 500 − 207 = 293, margin = 58.6%
    const margin = page.getByTestId('costing-margin');
    await expect(margin).toHaveText('58.6%');
    await expect(margin).toHaveAttribute('data-status', 'ok');
    await expect(margin).toHaveClass(/text-green-700/);
    await expect(page.getByTestId('costing-profit')).toContainText('$293.00');
  } finally {
    await cleanupJob(jobId);
  }
});

test('job with NO cost data shows "—", not a fake 100% margin', async ({ page }) => {
  test.setTimeout(60_000);
  await setCrewRate(40, 50);
  const jobId = await makeJob({ revenue: 300, title: `E2E Costing NoData ${Date.now()}` });
  // No clock events, no cost entries.
  try {
    await page.goto(`/dashboard/jobs/${jobId}`);
    const margin = page.getByTestId('costing-margin');
    await expect(margin).toHaveText('—', { timeout: 20_000 });
    await expect(margin).toHaveAttribute('data-status', 'no_cost_data');
    await expect(page.getByTestId('costing-status')).toContainText(/no cost data/i);
  } finally {
    await cleanupJob(jobId);
  }
});

test('job with an unrated worker shows "rate not set", not a fabricated margin', async ({ page }) => {
  test.setTimeout(60_000);
  await setCrewRate(null, null); // the crew member's hourly_rate is unset
  const jobId = await makeJob({ revenue: 500, title: `E2E Costing NoRate ${Date.now()}` });
  await clockHours(jobId, 2); // hours tracked, but unpriced
  try {
    await page.goto(`/dashboard/jobs/${jobId}`);
    await expect(page.getByTestId('costing-rate-warning')).toBeVisible({ timeout: 20_000 });
    const margin = page.getByTestId('costing-margin');
    await expect(margin).toHaveText('—');
    await expect(margin).toHaveAttribute('data-status', 'rate_not_set');
  } finally {
    await cleanupJob(jobId);
  }
});

test('loss-making job shows a negative margin in red', async ({ page }) => {
  test.setTimeout(60_000);
  await setCrewRate(40, 50);
  const jobId = await makeJob({ revenue: 100, title: `E2E Costing Loss ${Date.now()}` });
  await clockHours(jobId, 2); // $120 labor → total $138 on $100 revenue
  try {
    await page.goto(`/dashboard/jobs/${jobId}`);
    const margin = page.getByTestId('costing-margin');
    await expect(margin).toHaveText('-38.0%', { timeout: 20_000 });
    await expect(margin).toHaveAttribute('data-status', 'ok');
    await expect(margin).toHaveClass(/text-red-700/);
  } finally {
    await cleanupJob(jobId);
  }
});

test('crew can log a material on /complete and it persists', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  // Non-complete job (the complete page short-circuits a completed one).
  const jobId = await makeJob({ revenue: 0, title: `E2E Crew Materials ${Date.now()}`, status: 'in_progress' });
  const ctx = await browser.newContext({
    baseURL: baseURL ?? undefined,
    storageState: { cookies: [], origins: [] },
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/login');
    await page.locator('#email').fill(CREW.email, { timeout: 15_000 });
    await page.locator('#password').fill(CREW.password, { timeout: 15_000 });
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/today(\/|$|\?)/, { timeout: 30_000 });

    await page.goto(`/complete/${jobId}`);
    const section = page.getByTestId('crew-materials');
    await expect(section).toBeVisible({ timeout: 20_000 });
    await section.getByLabel('Material or expense name').fill('5 gal gas');
    await section.getByLabel('Cost').fill('18.50');
    await page.getByTestId('add-material').click();

    // Renders in the list with its total…
    await expect(page.getByTestId('material-row')).toContainText('5 gal gas', { timeout: 15_000 });
    await expect(page.getByTestId('materials-total')).toHaveText('$18.50');

    // …and persisted to job_cost_entries.
    await expect(async () => {
      const { data } = await admin
        .from('job_cost_entries')
        .select('description, unit_cost, category')
        .eq('job_id', jobId);
      expect(data?.length).toBe(1);
      expect(data?.[0]?.category).toBe('material');
      expect(Number(data?.[0]?.unit_cost)).toBe(18.5);
    }).toPass({ timeout: 10_000 });
  } finally {
    await ctx.close();
    await cleanupJob(jobId);
  }
});
