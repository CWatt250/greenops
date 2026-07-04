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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The phone must never scroll sideways — checked at every step of the day. */
async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
      - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow of ${overflow}px at 390px`).toBeLessThanOrEqual(1);
}

async function drawSignature(page: Page) {
  const canvas = page.locator('canvas').first();
  // The pad sits below the fold on a phone — mouse coords are viewport-
  // relative, so bring it on screen before stroking.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box, 'signature canvas must be visible').toBeTruthy();
  const { x, y, width, height } = box!;
  await page.mouse.move(x + width * 0.2, y + height * 0.5);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.5, y + height * 0.3, { steps: 5 });
  await page.mouse.move(x + width * 0.8, y + height * 0.6, { steps: 5 });
  await page.mouse.up();
  // Signing reveals the printed-name field — proof the stroke registered.
  await expect(page.getByPlaceholder(/john smith/i)).toBeVisible({ timeout: 10_000 });
}

async function completeJob(page: Page, note: string, withPhoto: boolean) {
  await expect(page.getByRole('button', { name: /mark job complete/i })).toBeVisible({ timeout: 30_000 });
  if (withPhoto) {
    await page.getByTestId('photo-input').setInputFiles({
      name: 'after.png', mimeType: 'image/png', buffer: TINY_PNG,
    });
    // wait for the background upload to finish (spinner overlay gone)
    await expect(page.locator('li .animate-spin')).toHaveCount(0, { timeout: 30_000 });
  }
  await page.locator('textarea').first().fill(note);
  await drawSignature(page);
  await page.getByPlaceholder(/john smith/i).fill('Jane Customer', { timeout: 10_000 });
  await page.getByTestId('complete-submit').click();
  await expect(page.getByText(/complete in|✅/i).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * A crew member's whole day on a 390px phone, with the dispatch board
 * checked from the office side at each stage:
 *   morning brief → start day → clock in (in-range geofence) → complete
 *   job 1 (photo+signature) → auto-forward → job 2 → dispatch shows
 *   2 complete → timesheets show the member's hours by NAME → End of Day.
 */
test('crew day @390px: brief → two jobs → dispatch tracks it → timesheets → EOD', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);

  // A timed-out prior run abandons its finally-cleanup — sweep stale
  // seeds first so the dispatch-board count assertions stay deterministic.
  await admin.from('jobs').delete().like('title', 'E2E Day Job %');

  const { data: client } = await admin
    .from('clients')
    .select('id, company_id, latitude, longitude')
    .eq('name', 'John Smith')
    .not('latitude', 'is', null)
    .limit(1)
    .maybeSingle();
  expect(client, 'geocoded John Smith client must exist').toBeTruthy();

  const { data: crew } = await admin
    .from('crews')
    .select('id')
    .eq('company_id', client!.company_id)
    .eq('name', 'Crew 1')
    .maybeSingle();
  expect(crew, 'Crew 1 must exist').toBeTruthy();

  const stamp = Date.now();
  const seed = async (n: number, order: number) => {
    const { data, error } = await admin
      .from('jobs')
      .insert({
        company_id: client!.company_id,
        client_id: client!.id,
        crew_id: crew!.id,
        title: `E2E Day Job ${n} ${stamp}`,
        status: 'scheduled',
        scheduled_date: todayStr(),
        scheduled_start: `${7 + n}:00`,
        route_order: order,
        estimated_duration_minutes: 30,
      })
      .select('id')
      .single();
    expect(error, `seed job ${n}: ${error?.message}`).toBeNull();
    return data!.id as string;
  };
  const job1 = await seed(1, 1);
  const job2 = await seed(2, 2);

  // Phone-sized crew context, GPS parked AT the job site (in-range punch).
  const crewCtx = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: Number(client!.latitude), longitude: Number(client!.longitude) },
    permissions: ['geolocation'],
  });
  const crewPage = await crewCtx.newPage();

  try {
    // ── Morning ──
    await crewPage.goto('/login');
    await crewPage.locator('#email').fill(CREW.email, { timeout: 15_000 });
    await crewPage.locator('#password').fill(CREW.password, { timeout: 15_000 });
    await crewPage.getByRole('button', { name: /sign in/i }).click();
    await crewPage.waitForURL(/\/today/, { timeout: 60_000 });
    await assertNoOverflow(crewPage, '/today morning');

    const startDay = crewPage.getByRole('button', { name: /start my day/i });
    if (await startDay.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await startDay.click();
    }
    await expect(crewPage.getByText(`E2E Day Job 1 ${stamp}`)).toBeVisible({ timeout: 30_000 });
    await expect(crewPage.getByText(`E2E Day Job 2 ${stamp}`)).toBeVisible();
    await assertNoOverflow(crewPage, '/today with stops');

    // ── Job 1: clock in (in range — no geofence prompt) ──
    await crewPage.goto(`/job/${job1}`);
    await crewPage.getByRole('button', { name: /clock in/i }).click({ timeout: 30_000 });
    await expect(crewPage.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 30_000 });
    await expect(crewPage.getByTestId('geofence-confirm')).toHaveCount(0);
    await assertNoOverflow(crewPage, 'job page clocked in');

    // Office: dispatch board reflects the morning. Scope to the seeded
    // rows (other specs may leave their own today-jobs behind, so global
    // counts aren't deterministic in a full-suite run).
    await page.goto('/dashboard/crew');
    const row1 = page.locator(`a[href="/dashboard/jobs/${job1}"]`);
    const row2 = page.locator(`a[href="/dashboard/jobs/${job2}"]`);
    await expect(row1).toBeVisible({ timeout: 30_000 });
    await expect(row1.getByText(/in progress/i)).toBeVisible({ timeout: 30_000 });
    await expect(row2.getByText(/scheduled/i)).toBeVisible();

    // ── Complete job 1 (photo + signature + note) ──
    await crewPage.goto(`/complete/${job1}`);
    await completeJob(crewPage, 'Front beds edged and mowed.', true);
    // Auto-forward lands back on /today focused at the next stop.
    await crewPage.waitForURL(/\/today/, { timeout: 20_000 });

    // ── Job 2 ──
    await crewPage.goto(`/job/${job2}`);
    await crewPage.getByRole('button', { name: /clock in/i }).click({ timeout: 30_000 });
    await expect(crewPage.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 30_000 });
    await crewPage.goto(`/complete/${job2}`);
    await completeJob(crewPage, 'Back lawn done.', false);

    // DB truth: both complete, exactly one photo (job 1).
    await expect(async () => {
      const { data } = await admin.from('jobs').select('id, status').in('id', [job1, job2]);
      expect(data?.filter((j) => j.status === 'complete')).toHaveLength(2);
    }).toPass({ timeout: 30_000, intervals: [2000] });
    const { data: photos } = await admin.from('job_photos').select('id').eq('job_id', job1);
    expect(photos).toHaveLength(1);

    // Office: dispatch shows the finished day + completion notifications.
    await page.goto('/dashboard/crew');
    await expect(page.locator(`a[href="/dashboard/jobs/${job1}"]`).getByText(/complete/i))
      .toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`a[href="/dashboard/jobs/${job2}"]`).getByText(/complete/i))
      .toBeVisible({ timeout: 30_000 });
    const { data: notifs } = await admin
      .from('notifications')
      .select('id')
      .in('entity_id', [job1, job2])
      .ilike('title', '%completed%');
    expect((notifs ?? []).length).toBeGreaterThanOrEqual(2);

    // Office: timesheets roll the hours up under the member's NAME
    // (migration 056 — no more "Unknown member").
    await page.goto('/dashboard/timesheets');
    await expect(page.getByText('E2E Crew').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/unknown member/i)).toHaveCount(0);

    // ── End of day ──
    // The EOD card requires ALL of the crew's today-jobs to be complete;
    // earlier specs in a full-suite run can leave strays behind. Cancel
    // anything that isn't ours (those tests have already finished).
    await admin
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('crew_id', crew!.id)
      .eq('scheduled_date', todayStr())
      .not('id', 'in', `(${job1},${job2})`)
      .neq('status', 'complete');
    await crewPage.goto('/today');
    await expect(crewPage.getByText(/day complete/i)).toBeVisible({ timeout: 30_000 });
    await assertNoOverflow(crewPage, 'end of day');
  } finally {
    await crewCtx.close();
    await admin.from('notifications').delete().in('entity_id', [job1, job2]);
    await admin.from('job_photos').delete().in('job_id', [job1, job2]);
    await admin.from('jobs').delete().in('id', [job1, job2]);
  }
});
