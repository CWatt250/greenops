import { test, expect, type Route, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';

/**
 * Skill-based crew assignment (migration 045) end-to-end.
 *
 * VROOM skills are a LOCK: a restricted service puts a required skill on its
 * job; only crews certified for that service (the matching skill) can take it.
 * We drive the real route builder with a SKILL-AWARE ORS mock (CI has no
 * ORS_API_KEY) that honours the `skills` our payload builder emits — so these
 * tests prove our payload + unassigned handling, not VROOM itself.
 *
 * Data is set up via a service-role client (bypasses RLS) against the same
 * local Supabase the suite uses, then torn down in afterAll.
 */

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const COMPANY = env.E2E_COMPANY_ID;
const RESTRICTED_SERVICE = 'E2E Fertilizing (restricted)';
const RESTRICTED_CLIENT = 'John Smith'; // a seed (020) client with a tomorrow job

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

async function setRouteDate(page: Page, dateStr: string) {
  const dateInput = page.locator('input[type="date"]');
  await expect(dateInput).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await dateInput.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, dateStr);
  await expect(dateInput).toHaveValue(dateStr);
  await expect(
    page.getByRole('button', { name: /auto-load all jobs scheduled/i }),
  ).toContainText(dateLabel(dateStr));
}

/**
 * Skill-aware ORS mock. Reads vehicle/job `skills` from the payload our code
 * built, assigns each job to the least-loaded eligible vehicle (whose skill set
 * is a superset of the job's), and drops jobs with no eligible vehicle into
 * `unassigned` — exactly VROOM's skill lock. Shape matches runOrs's parser.
 */
async function fulfillSkillAwareVroom(route: Route): Promise<void> {
  const body = route.request().postDataJSON() as {
    vehicles: Array<{ id: number; skills?: number[] }>;
    jobs: Array<{ id: number; skills?: number[] }>;
  };
  const load = new Map<number, number[]>(body.vehicles.map((v) => [v.id, []]));
  const unassigned: Array<{ id: number }> = [];
  for (const job of body.jobs) {
    const need = job.skills ?? [];
    const eligible = body.vehicles.filter((v) => need.every((s) => (v.skills ?? []).includes(s)));
    if (eligible.length === 0) { unassigned.push({ id: job.id }); continue; }
    eligible.sort((a, b) => load.get(a.id)!.length - load.get(b.id)!.length);
    load.get(eligible[0].id)!.push(job.id);
  }
  const routes = body.vehicles.map((v) => ({
    vehicle: v.id,
    steps: [
      { type: 'start' },
      ...load.get(v.id)!.map((id) => ({ type: 'job', id })),
      { type: 'end' },
    ],
    duration: 1800,
  }));
  const result = {
    code: 0,
    summary: { cost: 0, unassigned: unassigned.length, duration: routes.length * 1800 },
    routes,
    unassigned,
  };
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, result }),
  });
}

/** Ensure the restricted service + the John Smith job requirement exist, and set
 *  Crew 1's certification per the test. Idempotent. */
async function setupSkillData({ certifyCrew1 }: { certifyCrew1: boolean }): Promise<void> {
  const existing = await admin.from('services').select('id')
    .eq('company_id', COMPANY).eq('name', RESTRICTED_SERVICE).maybeSingle();
  let serviceId = existing.data?.id as string | undefined;
  if (!serviceId) {
    const ins = await admin.from('services').insert({
      company_id: COMPANY, name: RESTRICTED_SERVICE, category: 'fertilization',
      unit: 'per_visit', base_price: 50, restricted: true, is_active: true,
    }).select('id').single();
    serviceId = ins.data!.id as string;
  } else {
    await admin.from('services').update({ restricted: true, is_active: true }).eq('id', serviceId);
  }

  const crewsRes = await admin.from('crews').select('id, name').eq('company_id', COMPANY);
  const crew1 = (crewsRes.data ?? []).find((c) => c.name === 'Crew 1');

  // Reset this service's certifications, then certify Crew 1 if requested.
  await admin.from('crew_skills').delete().eq('service_id', serviceId);
  if (certifyCrew1 && crew1) {
    await admin.from('crew_skills').insert({ crew_id: crew1.id, service_id: serviceId });
  }

  // Attach the restricted service to the John Smith job scheduled tomorrow.
  const client = await admin.from('clients').select('id')
    .eq('company_id', COMPANY).eq('name', RESTRICTED_CLIENT).maybeSingle();
  const job = await admin.from('jobs').select('id')
    .eq('company_id', COMPANY).eq('client_id', client.data?.id ?? '')
    .eq('scheduled_date', tomorrowStr()).limit(1).maybeSingle();
  const jobId = job.data?.id;
  if (jobId) {
    await admin.from('job_services').delete().eq('job_id', jobId).eq('service_id', serviceId);
    await admin.from('job_services').insert({
      job_id: jobId, service_id: serviceId, quantity: 1, duration_minutes: 30, price: 50,
    });
  }
}

test.afterAll(async () => {
  const existing = await admin.from('services').select('id')
    .eq('company_id', COMPANY).eq('name', RESTRICTED_SERVICE).maybeSingle();
  const serviceId = existing.data?.id;
  if (!serviceId) return;
  await admin.from('job_services').delete().eq('service_id', serviceId);
  await admin.from('crew_skills').delete().eq('service_id', serviceId);
  await admin.from('services').delete().eq('id', serviceId);
});

/** Select both crews, auto-load tomorrow's jobs, wait for Optimize to enable. */
async function loadMultiCrew(page: Page) {
  await page.route('**/api/optimize-route', fulfillSkillAwareVroom);
  await page.goto('/dashboard/routes/new');
  await setRouteDate(page, tomorrowStr());
  await page.getByRole('button', { name: /select all crews/i }).click();
  await expect(page.getByRole('button', { name: /all selected/i })).toBeVisible();
  await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();
  const optimize = page.getByRole('button', { name: /optimize routes/i });
  await expect(optimize).toBeEnabled({ timeout: 40_000 });
  return optimize;
}

test('restricted job lands only on the certified crew', async ({ page }) => {
  test.setTimeout(60_000);
  await setupSkillData({ certifyCrew1: true });

  const optimize = await loadMultiCrew(page);
  await optimize.click();
  await expect(page.getByText(/routes optimized/i)).toBeVisible({ timeout: 10_000 });

  // The restricted client is routed under Crew 1 (certified), never under
  // Crew 2 (uncertified), and never left unroutable.
  const crew1 = page.locator('[data-testid="crew-group"][data-crew-name="Crew 1"]');
  const crew2 = page.locator('[data-testid="crew-group"][data-crew-name="Crew 2"]');
  await expect(
    crew1.getByTestId('stop-client-name').filter({ hasText: RESTRICTED_CLIENT }),
  ).toHaveCount(1);
  await expect(
    crew2.getByTestId('stop-client-name').filter({ hasText: RESTRICTED_CLIENT }),
  ).toHaveCount(0);
  await expect(page.getByTestId('unroutable-banner')).toHaveCount(0);
});

test('restricted job with no certified crew shows the unroutable banner (not silently dropped)', async ({ page }) => {
  test.setTimeout(60_000);
  await setupSkillData({ certifyCrew1: false });

  const optimize = await loadMultiCrew(page);
  await optimize.click();

  // The job is surfaced in a loud banner naming the missing certification +
  // the affected job — never silently dropped.
  const banner = page.getByTestId('unroutable-banner');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText(RESTRICTED_SERVICE);
  await expect(banner).toContainText(RESTRICTED_CLIENT);
});
