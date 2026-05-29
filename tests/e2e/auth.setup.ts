import { test as setup, expect } from '@playwright/test';
import { OWNER, OWNER_STATE } from './helpers/creds';

/**
 * Logs in as the owner once and persists the authenticated session to
 * `playwright/.auth/owner.json`. The `app` project (see playwright.config.ts)
 * loads this storage state so its specs start already signed in.
 */
setup('authenticate as owner', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Login pushes to "/", which role-redirects an owner to /dashboard.
  await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: OWNER_STATE });
});
