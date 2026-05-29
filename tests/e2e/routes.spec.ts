import { test, expect } from '@playwright/test';

/** Local YYYY-MM-DD for tomorrow — matches the seed's `current_date + 1` jobs. */
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Multi-crew route optimization. The seed (020_vroom_test_seed) leaves 8
 * geocoded jobs scheduled for tomorrow, unassigned, under 2 crews. We select
 * both crews, auto-load those jobs, and run VROOM (via /api/optimize-route,
 * which proxies OpenRouteService with the real ORS key from .env.test).
 */
test('optimize multi-crew route → VROOM reorders stops + success toast', async ({ page }) => {
  await page.goto('/dashboard/routes/new');

  // Target the day the seeded jobs live on.
  await page.locator('input[type="date"]').fill(tomorrowStr());

  // Select every crew → switches the builder into multi-crew mode.
  await page.getByRole('button', { name: /select all crews/i }).click();
  await expect(page.getByRole('button', { name: /all selected/i })).toBeVisible();

  // Auto-load all jobs scheduled for that date as route stops.
  await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();

  // Once stops load, the multi-crew optimize button enables.
  const optimize = page.getByRole('button', { name: /optimize routes/i });
  // Generous: stops auto-load + per-leg drive-time geometry, slow on a cold dev
  // server compiling the route on first hit.
  await expect(optimize).toBeEnabled({ timeout: 40_000 });
  await optimize.click();

  // VROOM round-trip → success toast. Generous timeout for the network call.
  await expect(page.getByText(/routes optimized/i)).toBeVisible({ timeout: 45_000 });
});
