import { test, expect } from '@playwright/test';
import { loadEnvTest } from './helpers/env';

loadEnvTest();

/** Local YYYY-MM-DD for tomorrow — matches the seed's `current_date + 1` jobs. */
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * REAL OpenRouteService integration. Unlike routes.spec.ts (which mocks the
 * proxy), this exercises the live ORS optimization endpoint end-to-end. It is
 * GUARDED so it never breaks the default CI run: with no ORS_API_KEY configured
 * (the CI default), the whole describe block skips. Set a real ORS_API_KEY in
 * .env.test (or the environment) to run it locally / in a keyed pipeline.
 */
test.describe('routes — live ORS integration', () => {
  test.skip(
    !process.env.ORS_API_KEY,
    'Requires a real ORS_API_KEY (live OpenRouteService optimization).',
  );

  test('optimize multi-crew route against the live ORS API → success toast', async ({ page }) => {
    // Live network round-trip — give it room above the assertion timeouts.
    test.setTimeout(90_000);

    await page.goto('/dashboard/routes/new');

    // Wait for the controlled date <input> to hydrate before filling, else
    // React re-binds it to today and auto-load loads the wrong day's jobs.
    const tomorrow = tomorrowStr();
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    await dateInput.fill(tomorrow);
    await expect(dateInput).toHaveValue(tomorrow);

    await page.getByRole('button', { name: /select all crews/i }).click();
    await expect(page.getByRole('button', { name: /all selected/i })).toBeVisible();

    await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();

    const optimize = page.getByRole('button', { name: /optimize routes/i });
    await expect(optimize).toBeEnabled({ timeout: 40_000 });

    const stopNames = page.getByTestId('stop-client-name');
    await expect(stopNames.first()).toBeVisible();
    const before = await stopNames.allTextContents();

    await optimize.click();

    // Real VROOM round-trip → success toast. Generous timeout for the network call.
    await expect(page.getByText(/routes optimized/i)).toBeVisible({ timeout: 45_000 });

    // Stops should still be the same set, distributed across the crews.
    const after = await stopNames.allTextContents();
    expect([...after].sort()).toEqual([...before].sort());
  });
});
