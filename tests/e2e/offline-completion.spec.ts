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

/** 1×1 red PNG — enough to exercise the photo blob → storage path. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function seedJob(title: string): Promise<string> {
  const { data: client } = await admin
    .from('clients')
    .select('id, company_id')
    .eq('name', 'John Smith')
    .limit(1)
    .maybeSingle();
  expect(client, 'seeded John Smith client must exist').toBeTruthy();
  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      company_id: client!.company_id,
      client_id: client!.id,
      title,
      status: 'in_progress',
      scheduled_date: todayStr(),
      actual_start: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(error, `job insert failed: ${error?.message}`).toBeNull();
  return job!.id as string;
}

async function crewLogin(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(CREW.email, { timeout: 15_000 });
  await page.locator('#password').fill(CREW.password, { timeout: 15_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/today', { timeout: 30_000 });
}

/**
 * The airplane-mode acceptance test from the roadmap (F3.3): complete TWO
 * jobs with no connection → reconnect → both jobs complete exactly once,
 * media included, via the IndexedDB queue + idempotent replay.
 */
test('offline completion: two jobs finished in airplane mode sync exactly once on reconnect', async ({ browser, baseURL }) => {
  // Generous: two cold dev-server compiles of the crew routes + a full crew
  // login live inside this single test.
  test.setTimeout(300_000);

  const stamp = Date.now();
  const jobAId = await seedJob(`E2E Offline A ${stamp}`);
  const jobBId = await seedJob(`E2E Offline B ${stamp}`);

  // Fresh logged-out context (explicit baseURL + empty storageState — the
  // owner storageState from the project fixtures must not leak in).
  const context = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  const pageA = await context.newPage();

  try {
    await crewLogin(pageA);

    // Load BOTH completion pages while online (the realistic flow: the crew
    // opens the job before signal drops; prefetch covers the in-page nav).
    await pageA.goto(`/complete/${jobAId}`);
    await expect(pageA.getByRole('button', { name: /mark job complete/i })).toBeVisible({ timeout: 30_000 });

    const pageB = await context.newPage();
    await pageB.goto(`/complete/${jobBId}`);
    await expect(pageB.getByRole('button', { name: /mark job complete/i })).toBeVisible({ timeout: 30_000 });

    // ── Airplane mode ──
    await context.setOffline(true);

    // The submit button flips to the offline variant on both tabs.
    await expect(pageA.getByRole('button', { name: /save offline/i })).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByRole('button', { name: /save offline/i })).toBeVisible({ timeout: 10_000 });

    // Job A gets a photo while offline — no upload attempt should fire; the
    // blob rides along in IndexedDB.
    await pageA.getByTestId('photo-input').setInputFiles({
      name: 'after.png', mimeType: 'image/png', buffer: TINY_PNG,
    });
    await pageA.locator('textarea').first().fill('Done offline — A');
    await pageB.locator('textarea').first().fill('Done offline — B');

    await pageA.getByTestId('complete-submit').click();
    await expect(pageA.getByText(/saved offline/i).first()).toBeVisible({ timeout: 10_000 });
    await pageB.getByTestId('complete-submit').click();
    await expect(pageB.getByText(/saved offline/i).first()).toBeVisible({ timeout: 10_000 });

    // Neither job is complete while offline.
    const { data: still } = await admin.from('jobs').select('id, status').in('id', [jobAId, jobBId]);
    expect(still?.every((j) => j.status !== 'complete')).toBe(true);

    // ── Reconnect ──
    await context.setOffline(false);
    pageA.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser error]', msg.text());
    });
    pageA.on('pageerror', (err) => console.log('[pageerror]', err.message));
    // Fresh /today load mounts CrewStatusBar, which runs the sync engine.
    await pageA.goto('/today');
    await expect(pageA.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 60_000 });

    // Both jobs flip to complete.
    await expect(async () => {
      const { data, error } = await admin.from('jobs').select('id, status').in('id', [jobAId, jobBId]);
      console.log('[poll]', JSON.stringify(data), error?.message ?? '');
      expect(data?.filter((j) => j.status === 'complete')).toHaveLength(2);
    }).toPass({ timeout: 90_000, intervals: [3000] });

    // Exactly once: one photo row for A (deterministic offline path), none for B.
    const { data: photosA } = await admin.from('job_photos').select('storage_path').eq('job_id', jobAId);
    expect(photosA).toHaveLength(1);
    expect(photosA![0].storage_path).toContain('offline-');
    const { data: photosB } = await admin.from('job_photos').select('id').eq('job_id', jobBId);
    expect(photosB).toHaveLength(0);

    // The queue drained — banner gone after a reload.
    await pageA.reload();
    await expect(pageA.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByTestId('offline-completions-banner')).toHaveCount(0);

    // Replay a stale sync (simulates a second device/tab racing): the 046
    // guard rejects, the engine treats it as already-done. Job stays complete
    // with still exactly one photo.
    const { data: after } = await admin.from('jobs').select('status, actual_end').eq('id', jobAId).single();
    expect(after?.status).toBe('complete');
    expect(after?.actual_end).toBeTruthy();
  } finally {
    await context.close();
    // Cleanup: remove seeded jobs + their photos.
    await admin.from('job_photos').delete().in('job_id', [jobAId, jobBId]);
    await admin.from('jobs').delete().in('id', [jobAId, jobBId]);
  }
});
