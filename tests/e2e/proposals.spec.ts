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

/**
 * Proposal → Job auto-carry (migration 043 spine): accept a proposal, convert
 * it to a job, and confirm the proposal line item is snapshotted into the job's
 * services — pre-filled and editable, not live-linked back to the proposal.
 */
test('convert an accepted proposal → job services are pre-filled and editable', async ({ page }) => {
  const stamp = Date.now();
  const prospect = `E2E Convert Prospect ${stamp}`;
  const lineDesc = `E2E convert service ${stamp}`;

  // Build + save a draft proposal with one custom line item priced at $200.
  await page.goto('/dashboard/proposals/new');
  await page.locator('#prospect-name').fill(prospect);
  await page.getByRole('button', { name: /continue to services/i }).click();

  // The wizard auto-seeds default services for a residential prospect (mowing +
  // edging). Wait for them to appear, then clear them so the proposal carries
  // exactly one deterministic line item to assert against after convert.
  const removeBtns = page.getByRole('button', { name: /remove line item/i });
  await expect(removeBtns.first()).toBeVisible({ timeout: 10_000 });
  for (let n = await removeBtns.count(); n > 0; n = await removeBtns.count()) {
    await removeBtns.first().click();
  }
  await expect(removeBtns).toHaveCount(0);

  await page.getByRole('button', { name: /custom line item/i }).click();
  const row = page.locator('li', {
    has: page.getByPlaceholder('e.g. Trim the rose bushes'),
  });
  await row.getByPlaceholder('e.g. Trim the rose bushes').fill(lineDesc);
  const numbers = row.getByRole('spinbutton');
  await numbers.nth(0).fill('1');   // Qty
  await numbers.nth(1).fill('200'); // Unit $

  await page.getByRole('button', { name: /^review$/i }).click();
  await page.getByRole('button', { name: /save draft/i }).click();
  await page.waitForURL(/\/dashboard\/proposals\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // Accept → the "Convert to Job" action appears → convert.
  await page.getByRole('button', { name: /^accept$/i }).click();
  await page.getByRole('button', { name: /convert to job/i }).click();

  // Redirects to the new job; the Services section is pre-filled from the proposal.
  await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const jobUrl = page.url();
  await expect(page.getByText(lineDesc).first()).toBeVisible({ timeout: 15_000 });

  // Editable on the job: the row rehydrates with the snapshot name + price.
  await page.goto(`${jobUrl}/edit`);
  await expect(page.getByLabel('Service name')).toHaveValue(lineDesc, { timeout: 15_000 });
  await expect(page.getByTestId('services-total-price')).toContainText('200');
});
