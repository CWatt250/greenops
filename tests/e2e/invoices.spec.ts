import { test, expect } from '@playwright/test';

/** Local YYYY-MM-DD for today. */
function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Job → Invoice auto-carry (migration 043 spine): create a job with a priced
 * service, generate an invoice from that job, and confirm the invoice line
 * items are pre-filled from the job's services (price as the billable amount)
 * and remain editable. Snapshot only — editing the invoice never rewrites the
 * job. Runs authenticated as owner.
 */
test('generate an invoice from a job → line items pre-filled from job services, then editable', async ({ page }) => {
  const stamp = Date.now();
  const jobTitle = `E2E Invoice Job ${stamp}`;
  const svcName = `E2E Spring Cleanup ${stamp}`;

  // Create a job carrying one custom service priced at $90.
  await page.goto('/dashboard/jobs/new');
  await page.locator('#title').fill(jobTitle);

  await page.getByRole('button', { name: /search clients/i }).click();
  await page.getByPlaceholder(/search by name, phone, address/i).fill('John Smith');
  await page.getByRole('option', { name: /John Smith/i }).first().click();

  await page.locator('#scheduled_date').fill(todayStr());

  await page.getByRole('button', { name: /add custom service/i }).click();
  await page.getByLabel('Service name').fill(svcName);
  await page.getByLabel('Quantity').fill('1');
  await page.getByLabel('Price').fill('90');

  await page.getByRole('button', { name: /^create job$/i }).click();
  await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const jobId = page.url().split('/').pop()!;

  // Generate an invoice from the job (the same entry the status workflow links to).
  await page.goto(`/dashboard/invoices/new?job_id=${jobId}`);

  // Live preview shows the job service carried in as a pre-filled line item,
  // priced from job_services.price.
  await expect(page.getByText(svcName).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('$90.00').first()).toBeVisible();

  // The line item is editable in the form — its description input is pre-filled
  // and can be changed without touching the job.
  const descInput = page.getByPlaceholder('Description');
  await expect(descInput).toHaveValue(svcName);
  await descInput.fill(`${svcName} edited`);
  await expect(descInput).toHaveValue(`${svcName} edited`);
});
