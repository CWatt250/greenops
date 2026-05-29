import { test, expect } from '@playwright/test';

/** Local YYYY-MM-DD for today (matches how the schedule anchors its week/day). */
function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Create a job for an existing (seeded) client on today's date, then confirm it
 * renders on the schedule. Runs authenticated as owner.
 */
test('create a job → it appears on the schedule', async ({ page }) => {
  const unique = `E2E Mow ${Date.now()}`;

  await page.goto('/dashboard/jobs/new');

  await page.locator('#title').fill(unique);

  // Pick a seeded client via the combobox (Popover + cmdk Command).
  await page.getByRole('button', { name: /search clients/i }).click();
  await page.getByPlaceholder(/search by name, phone, address/i).fill('John Smith');
  await page.getByRole('option', { name: /John Smith/i }).first().click();

  await page.locator('#scheduled_date').fill(todayStr());

  await page.getByRole('button', { name: /^create job$/i }).click();

  // Success → redirect to the new job's detail page.
  await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // It shows up on the schedule. The default week view renders job cards (the
  // desktop grid); the mobile view is a hidden duplicate, so filter to visible.
  await page.goto('/dashboard/schedule');
  await expect(
    page.getByText(unique).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
