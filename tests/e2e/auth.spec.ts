import { test, expect } from '@playwright/test';
import { OWNER, CREW } from './helpers/creds';

/**
 * Fresh-login flows. These run in the `auth` project WITHOUT a stored session
 * (the proxy bounces already-authenticated users away from /login), so each
 * test signs in from scratch and asserts the role-based landing page.
 */
test.describe('authentication', () => {
  async function login(page, email: string, password: string) {
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
});
