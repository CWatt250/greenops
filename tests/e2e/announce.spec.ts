import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';
import { CREW } from './helpers/creds';

/**
 * Announcement broadcast, end to end:
 *   owner opens the top-bar megaphone → sends an `all_crew` announcement →
 *   it is created against the seeded crew recipient and surfaces in that
 *   crew member's notification bell.
 *
 * The seeded crew user's crew membership is provisioned by
 * `scripts/seed-e2e-users.mjs` (global setup), without which an `all_crew`
 * broadcast would reach nobody.
 */
const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// The top-bar megaphone lives in the mobile header (`md:hidden`), so run this
// spec at a phone viewport to exercise the real wired control.
test.use({ viewport: { width: 390, height: 844 } });

test('owner broadcasts from the top-bar megaphone and the crew recipient sees it', async ({ page, browser }) => {
  // Two full logins (owner storage-state + a fresh crew context) across the
  // dashboard, /login and /today routes — well past the 30s default.
  test.setTimeout(120_000);

  const title = `E2E announcement ${Date.now()}`;
  const body = 'Sent from the dashboard top-bar megaphone.';

  // Resolve the seeded crew user's profile id (notifications key off it).
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const crewUser = list.users.find((u) => u.email?.toLowerCase() === CREW.email.toLowerCase());
  expect(crewUser, 'seeded crew user must exist').toBeTruthy();

  // 1. Owner opens the composer from the top-bar megaphone.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /announcements/i }).click();

  // 2. The REAL composer opens (not the old "Coming soon" placeholder).
  await expect(page.getByRole('heading', { name: /send an announcement/i })).toBeVisible();
  const sheet = page.getByRole('dialog');
  await sheet.locator('#ann-title').fill(title);
  await sheet.locator('#ann-body').fill(body);
  // Wait for the async recipient count to render BEFORE clicking: its arrival
  // re-renders the sheet, and a click dispatched across that re-render lands
  // on a detached button node — a silent no-op (the audit's flake).
  await expect(sheet.getByText(/will reach \d+ crew member/i)).toBeVisible({ timeout: 15_000 });
  // Audience defaults to "All crew"; send.
  await sheet.getByRole('button', { name: /send announcement/i }).click();

  // 3. Success toast confirms delivery to crew member(s). Generous timeout:
  //    under a fully-parallel local run the dev server is compiling several
  //    routes at once and the send round-trip can exceed 15s (audit #21).
  await expect(page.getByText(/announcement sent to .* crew member/i)).toBeVisible({ timeout: 30_000 });

  // 4. A notification row was created against the seeded crew recipient.
  await expect(async () => {
    const { data } = await admin
      .from('notifications')
      .select('id, title, profile_id')
      .eq('profile_id', crewUser!.id)
      .eq('title', title);
    expect(data?.length ?? 0).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });

  // 5. It surfaces in the crew member's notification bell.
  //    A logged-OUT context so the crew can sign in. Two non-obvious options
  //    are required: an explicit `baseURL` (a raw context has none, so relative
  //    goto()s wouldn't reach the app) and an empty `storageState` (otherwise
  //    the owner's session leaks in, /login bounces to /dashboard and the login
  //    form never renders). Per-step timeouts keep a stuck step from silently
  //    eating the whole test timeout.
  const crewCtx = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: { cookies: [], origins: [] },
  });
  const crewPage = await crewCtx.newPage();
  try {
    await crewPage.goto('/login');
    await crewPage.locator('#email').fill(CREW.email, { timeout: 15_000 });
    await crewPage.locator('#password').fill(CREW.password, { timeout: 15_000 });
    await crewPage.getByRole('button', { name: /sign in/i }).click({ timeout: 15_000 });
    // Crew role redirects to /today, whose layout renders the bell.
    await crewPage.waitForURL(/\/today(\/|$|\?)/, { timeout: 30_000 });

    // 6. The unread broadcast surfaces INLINE on /today (audit #13) — not
    //    bell-only — and dismissing it marks the notification read.
    const banner = crewPage.getByTestId('broadcast-banner');
    await expect(banner.getByText(title)).toBeVisible({ timeout: 15_000 });
    await banner
      .getByRole('button', { name: /dismiss announcement/i })
      .first()
      .click();
    await expect(banner.getByText(title)).toHaveCount(0);
    await expect(async () => {
      const { data } = await admin
        .from('notifications')
        .select('is_read')
        .eq('profile_id', crewUser!.id)
        .eq('title', title)
        .single();
      expect(data?.is_read).toBe(true);
    }).toPass({ timeout: 10_000 });

    // 7. Still listed in the bell history after dismissal.
    await crewPage.getByRole('button', { name: /notifications/i }).click({ timeout: 15_000 });
    await expect(crewPage.getByText(title)).toBeVisible({ timeout: 10_000 });
  } finally {
    await crewCtx.close();
  }
});
