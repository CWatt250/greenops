import { test, expect } from '@playwright/test';
import { loadEnvTest, hasRealMapboxToken } from './helpers/env';

loadEnvTest();

/**
 * Property measure tool. Geocoding, satellite tiles, and polygon drawing all
 * require a real Mapbox token. With the placeholder token in .env.test the full
 * draw flow can't run, so it auto-skips (see TESTING.md) while the page-level
 * smoke still verifies the tool renders. Set a real NEXT_PUBLIC_MAPBOX_TOKEN to
 * exercise the end-to-end flow.
 */
test.describe('measure', () => {
  test('measure page renders the address search', async ({ page }) => {
    await page.goto('/dashboard/measure');
    await expect(page).toHaveURL(/\/dashboard\/measure/);
    await expect(page.getByRole('textbox', { name: /address to measure/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('search a Tri-Cities address, draw a polygon, see square footage', async ({ page }) => {
    test.skip(!hasRealMapboxToken(), 'Requires a real NEXT_PUBLIC_MAPBOX_TOKEN (geocoding + tiles).');

    await page.goto('/dashboard/measure');

    // Search and select a Tri-Cities address.
    const search = page.getByRole('textbox', { name: /address to measure/i });
    await search.fill('8524 W Clearwater Ave, Kennewick, WA');
    const suggestion = page.getByRole('option').first();
    await suggestion.click({ timeout: 10_000 }).catch(async () => {
      await search.press('Enter');
    });

    // Wait for the satellite map to settle on the address.
    const canvas = page.locator('canvas.mapboxgl-canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);

    // Activate the polygon (Area) tool and trace a quad, double-clicking to close.
    await page.getByRole('button', { name: /polygon — measure area/i }).click();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('map canvas not measurable');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const pts = [
      [cx - 80, cy - 80],
      [cx + 80, cy - 80],
      [cx + 80, cy + 80],
      [cx - 80, cy + 80],
    ];
    for (const [x, y] of pts) await page.mouse.click(x, y);
    await page.mouse.dblclick(pts[0][0], pts[0][1]);

    // Square footage shows up in the area summary.
    await expect(page.getByText(/sq ft/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/[1-9][\d,]*\s*$/).first()).toBeVisible();

    // Each polygon edge gets its own distance label on the map. The anchored
    // "<n> ft" pattern excludes the area summary's "<n> sq ft".
    await expect(page.getByText(/^\d[\d,]* ft$/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('line tool labels each drawn segment with its distance', async ({ page }) => {
    test.skip(!hasRealMapboxToken(), 'Requires a real NEXT_PUBLIC_MAPBOX_TOKEN (geocoding + tiles).');

    await page.goto('/dashboard/measure');

    const search = page.getByRole('textbox', { name: /address to measure/i });
    await search.fill('8524 W Clearwater Ave, Kennewick, WA');
    const suggestion = page.getByRole('option').first();
    await suggestion.click({ timeout: 10_000 }).catch(async () => {
      await search.press('Enter');
    });

    const canvas = page.locator('canvas.mapboxgl-canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);

    // Draw a two-segment line (three points), finishing with a double-click.
    await page.getByRole('button', { name: /line — measure distance/i }).click();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('map canvas not measurable');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.click(cx - 100, cy);
    await page.mouse.click(cx, cy - 60);

    // Before the last point is placed, a live rubber-band distance tracks the
    // cursor as it moves.
    await page.mouse.move(cx + 100, cy);
    await expect(page.getByText(/^\d[\d,]* ft$/).first()).toBeVisible({ timeout: 10_000 });

    await page.mouse.dblclick(cx + 100, cy);

    // Two segments → at least two static distance labels remain on the map.
    await expect(page.getByText(/^\d[\d,]* ft$/)).toHaveCount(2, { timeout: 10_000 });
  });
});
