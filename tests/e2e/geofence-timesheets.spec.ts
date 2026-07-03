import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';
import { CREW } from './helpers/creds';

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function crewLogin(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(CREW.email, { timeout: 15_000 });
  await page.locator('#password').fill(CREW.password, { timeout: 15_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/today', { timeout: 30_000 });
}

/**
 * Geofence AC (F3.2): a clock-in far from the client's coordinates asks for
 * confirmation + reason, lands flagged with the distance recorded, shows in
 * the office timesheets review queue, and Approve clears it.
 */
test('out-of-range clock-in → confirm + flag → office reviews on timesheets', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);

  // Seed a job on a geocoded client (routes seed leaves John Smith geocoded).
  const { data: client } = await admin
    .from('clients')
    .select('id, company_id, latitude, longitude')
    .eq('name', 'John Smith')
    .not('latitude', 'is', null)
    .limit(1)
    .maybeSingle();
  expect(client, 'geocoded John Smith client must exist').toBeTruthy();
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      company_id: client!.company_id,
      client_id: client!.id,
      title: `E2E Geofence ${Date.now()}`,
      status: 'scheduled',
      scheduled_date: todayStr(),
    })
    .select('id')
    .single();
  expect(jobErr, `job insert failed: ${jobErr?.message}`).toBeNull();
  const jobId = job!.id as string;

  // Crew context with GPS ~5km north of the site.
  const crewCtx = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
    geolocation: {
      latitude: Number(client!.latitude) + 0.045,
      longitude: Number(client!.longitude),
    },
    permissions: ['geolocation'],
  });
  const crewPage = await crewCtx.newPage();

  try {
    await crewLogin(crewPage);
    await crewPage.goto(`/job/${jobId}`);

    await crewPage.getByRole('button', { name: /clock in/i }).click();

    // The geofence gate appears instead of a silent punch.
    const confirm = crewPage.getByTestId('geofence-confirm');
    await expect(confirm).toBeVisible({ timeout: 20_000 });
    await expect(confirm).toContainText(/from John Smith/i);
    await confirm.getByPlaceholder(/reason/i).fill('Parked on the access road');
    await confirm.getByRole('button', { name: /clock in anyway/i }).click();

    // Punch recorded: flagged, with distance ≈ 5km and the reason.
    await expect(async () => {
      const { data } = await admin
        .from('clock_events')
        .select('flagged, flag_reason, distance_from_site_m, reviewed_at')
        .eq('job_id', jobId)
        .eq('event_type', 'clock_in')
        .maybeSingle();
      expect(data?.flagged).toBe(true);
      expect(data?.flag_reason).toContain('access road');
      expect(Number(data?.distance_from_site_m)).toBeGreaterThan(4000);
      expect(data?.reviewed_at).toBeNull();
    }).toPass({ timeout: 20_000, intervals: [1000] });

    // Office side (owner storageState on the default `page` fixture): the
    // flagged punch is in the timesheets review queue; Approve clears it.
    await page.goto('/dashboard/timesheets');
    const queue = page.getByText(/outside the site radius/i);
    await expect(queue).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/access road/i)).toBeVisible();
    await page.getByRole('button', { name: /^approve$/i }).first().click();

    await expect(async () => {
      const { data } = await admin
        .from('clock_events')
        .select('reviewed_at, reviewed_by')
        .eq('job_id', jobId)
        .eq('event_type', 'clock_in')
        .maybeSingle();
      expect(data?.reviewed_at).toBeTruthy();
      expect(data?.reviewed_by).toBeTruthy();
    }).toPass({ timeout: 15_000, intervals: [1000] });
  } finally {
    await crewCtx.close();
    await admin.from('clock_events').delete().eq('job_id', jobId);
    await admin.from('jobs').delete().eq('id', jobId);
  }
});
