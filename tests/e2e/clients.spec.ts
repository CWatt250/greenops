import { test, expect } from '@playwright/test';

/**
 * Create a client through the form and confirm it shows up in the clients list.
 * Runs in the `app` project (already authenticated as owner).
 */
test('create a client → it appears in the clients list', async ({ page }) => {
  const unique = `E2E Client ${Date.now()}`;

  await page.goto('/dashboard/clients/new');

  // property_type defaults to 'residential'; name + service address are required.
  await page.locator('#name').fill(unique);
  await page.locator('#service_address').fill('123 Test Orchard Way');
  await page.locator('#service_city').fill('Kennewick');
  await page.locator('#service_state').fill('WA');

  await page.getByRole('button', { name: /^save client$/i }).click();

  // On success the form redirects to the new client's detail page.
  await page.waitForURL(/\/dashboard\/clients\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText(unique).filter({ visible: true }).first()).toBeVisible();

  // And it is findable back in the list view. The client-table renders both a
  // desktop table and a hidden mobile card list, so filter to the visible one.
  await page.goto('/dashboard/clients');
  await page.getByPlaceholder(/search by name/i).fill(unique);
  await expect(page.getByText(unique).filter({ visible: true }).first()).toBeVisible();
});
