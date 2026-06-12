import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { OWNER, CREW } from './helpers/creds';
import { loadEnvTest } from './helpers/env';

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Fresh-login flows. These run in the `auth` project WITHOUT a stored session
 * (the proxy bounces already-authenticated users away from /login), so each
 * test signs in from scratch and asserts the role-based landing page.
 */
test.describe('authentication', () => {
  async function login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
  }

  test('owner logs in and lands on the dashboard', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('crew logs in and lands on /today', async ({ page }) => {
    await login(page, CREW.email, CREW.password);
    await page.waitForURL(/\/today(\/|$|\?)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/today/);
  });

  test('bad credentials show an error and stay on /login', async ({ page }) => {
    await login(page, OWNER.email, 'wrong-password');
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * Data-leak guard from the 2026-06 audit: a crew login with NO crew_members
   * row used to skip the crew filter on /today and return EVERY company job
   * for the date. The crewless worker must see the "not assigned to a crew"
   * state — never another crew's jobs.
   */
  test('crew member with no crew sees the unassigned state, not company jobs', async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const email = `e2e-crewless-${stamp}@tlc.com`;
    const password = 'e2e-Crewless-Pass-123!';
    const leakTitle = `E2E Leak Canary ${stamp}`;

    // A company job scheduled TODAY (the bug leaked exactly these).
    const d = new Date();
    const today = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const { data: leakJob, error: jobErr } = await admin
      .from('jobs')
      .insert({ company_id: env.E2E_COMPANY_ID, title: leakTitle, status: 'unscheduled', scheduled_date: today })
      .select('id')
      .single();
    expect(jobErr, `canary job insert failed: ${jobErr?.message}`).toBeNull();

    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(userErr, `temp user create failed: ${userErr?.message}`).toBeNull();
    const userId = created!.user!.id;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        company_id: env.E2E_COMPANY_ID,
        role: 'crew',
        full_name: 'E2E Crewless',
        welcome_tour_completed: true,
      },
      { onConflict: 'id' },
    );
    expect(profErr, `profile upsert failed: ${profErr?.message}`).toBeNull();

    try {
      await login(page, email, password);
      await page.waitForURL(/\/today(\/|$|\?)/, { timeout: 30_000 });

      await expect(
        page.getByText(/not assigned to a crew yet/i),
      ).toBeVisible({ timeout: 15_000 });
      // The canary company job must NOT leak through.
      await expect(page.getByText(leakTitle)).toHaveCount(0);
    } finally {
      if (leakJob?.id) await admin.from('jobs').delete().eq('id', leakJob.id);
      await admin.from('profiles').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });
});
