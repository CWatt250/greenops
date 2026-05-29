import { test, expect } from '@playwright/test';

/**
 * Build a proposal for a brand-new prospect with a single custom line item and
 * save it as a draft. The wizard defaults to the "New prospect" path on step 1.
 * Runs authenticated as owner.
 */
test('create a proposal for a new prospect with a custom line item', async ({ page }) => {
  const stamp = Date.now();
  const prospect = `E2E Prospect ${stamp}`;
  const lineDesc = `E2E custom mulch install ${stamp}`;

  await page.goto('/dashboard/proposals/new');

  // Step 1 — new prospect (default path).
  await page.locator('#prospect-name').fill(prospect);
  await page.getByRole('button', { name: /continue to services/i }).click();

  // Step 2 — add and fill a custom line item.
  await page.getByRole('button', { name: /custom line item/i }).click();

  const row = page.locator('li', {
    has: page.getByPlaceholder('e.g. Trim the rose bushes'),
  });
  await row.getByPlaceholder('e.g. Trim the rose bushes').fill(lineDesc);
  const numbers = row.getByRole('spinbutton');
  await numbers.nth(0).fill('1');   // Qty
  await numbers.nth(1).fill('150'); // Unit $

  await page.getByRole('button', { name: /^review$/i }).click();

  // Step 3 — save as draft.
  await page.getByRole('button', { name: /save draft/i }).click();

  // Success → redirect to the proposal detail page, which shows the line item.
  await page.waitForURL(/\/dashboard\/proposals\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText(lineDesc).first()).toBeVisible({ timeout: 15_000 });
});
