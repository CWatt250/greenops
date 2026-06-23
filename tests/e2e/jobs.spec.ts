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

/**
 * Services spine (migration 043): add a custom service to a job, watch the
 * running totals (price + on-site duration), save, and confirm the row + totals
 * survive a reload — then edit the price inline and confirm the new total
 * persists too. Exercises the shared ServicePicker create + edit paths.
 */
test('add + edit a custom service on a job → totals persist on reload', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E Services Job ${stamp}`;
  const svcName = `E2E Hedge Trim ${stamp}`;

  await page.goto('/dashboard/jobs/new');
  await page.locator('#title').fill(title);

  await page.getByRole('button', { name: /search clients/i }).click();
  await page.getByPlaceholder(/search by name, phone, address/i).fill('John Smith');
  await page.getByRole('option', { name: /John Smith/i }).first().click();

  await page.locator('#scheduled_date').fill(todayStr());

  // Add a one-off custom service and fill its row.
  await page.getByRole('button', { name: /add custom service/i }).click();
  await page.getByLabel('Service name').fill(svcName);
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Duration in minutes').fill('45');
  await page.getByLabel('Price').fill('60');

  // Running totals: 2 × $60 = $120, 2 × 45 min = 1h 30m.
  await expect(page.getByTestId('services-total-price')).toContainText('120');
  await expect(page.getByTestId('services-total-duration')).toContainText('1h 30m');

  await page.getByRole('button', { name: /^create job$/i }).click();
  await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const jobUrl = page.url();

  // Detail page shows the service + total under the Services card.
  await expect(page.getByText(svcName).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('$120.00').first()).toBeVisible();

  // Reload via the edit page → the persisted row rehydrates, still editable.
  await page.goto(`${jobUrl}/edit`);
  await expect(page.getByLabel('Service name')).toHaveValue(svcName, { timeout: 15_000 });
  await expect(page.getByTestId('services-total-price')).toContainText('120');

  // Edit the price inline → total updates → save → persists on the detail page.
  await page.getByLabel('Price').fill('100');
  await expect(page.getByTestId('services-total-price')).toContainText('200');
  await page.getByRole('button', { name: /^update job$/i }).click();
  await page.waitForURL(jobUrl, { timeout: 30_000 });
  await expect(page.getByText('$200.00').first()).toBeVisible({ timeout: 15_000 });
});

/**
 * The searchable catalog dropdown seeds a row with the service's default price
 * and duration (snapshot — editable thereafter).
 */
test('add a catalog service to a job via the searchable dropdown', async ({ page }) => {
  await page.goto('/dashboard/jobs/new');

  await page.getByRole('button', { name: /^add service$/i }).click();
  await page.getByPlaceholder(/search services/i).fill('Edging');
  await page.getByRole('option', { name: /Edging/i }).first().click();

  // The row seeds the service name and a non-zero price/duration from the catalog.
  await expect(page.getByLabel('Service name')).toHaveValue(/Edging/i);
  await expect(page.getByTestId('services-total-price')).toBeVisible();
});

test.describe('job detail — mobile responsiveness', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('job detail page has no horizontal overflow on a 390px phone', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    // Resolve the first real job's URL (exclude New/Edit) and navigate directly,
    // sidestepping mobile card-overlay click interception.
    const jobLink = page
      .locator('a[href^="/dashboard/jobs/"]:not([href$="/new"]):not([href$="/edit"])')
      .first();
    await expect(jobLink).toBeVisible({ timeout: 15_000 });
    const href = await jobLink.getAttribute('href');
    expect(href).toMatch(/\/dashboard\/jobs\/[0-9a-f-]{36}/);
    await page.goto(href!);

    // Let the costing tab + forms finish their async loads, then measure overflow.
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
