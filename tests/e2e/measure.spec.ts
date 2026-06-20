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

  // The freehand "Draw" method is touch/tablet-only, gated purely on the CSS
  // (pointer: coarse) capability (no JS device sniffing) via the Tap/Draw
  // toggle. These checks need no Mapbox token — the toolbar renders regardless
  // of map tiles — so they run in CI alongside the token-gated draw tests above.
  test.describe('freehand draw method — coarse pointer (touch/tablet)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('Tap/Draw toggle is visible on a touch viewport', async ({ page }) => {
      await page.goto('/dashboard/measure');
      await expect(
        page.getByRole('button', { name: /draw — drag your finger to trace freehand/i }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('freehand draw method — toggle actually switches', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('tapping Draw activates freehand; Area then enters paint mode', async ({ page }) => {
      await page.goto('/dashboard/measure');

      const drawToggle = page.getByRole('button', { name: /draw — drag your finger to trace freehand/i });
      const tapToggle = page.getByRole('button', { name: /tap — place points one at a time/i });
      await expect(drawToggle).toBeVisible({ timeout: 15_000 });

      // Starts on Tap.
      await expect(tapToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(drawToggle).toHaveAttribute('aria-pressed', 'false');

      // Tapping Draw must flip the toggle.
      await drawToggle.click();
      await expect(drawToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(tapToggle).toHaveAttribute('aria-pressed', 'false');

      // With Draw active, tapping Area enters freehand paint mode (hint shows).
      // (The hint text renders in both the mobile and the hidden desktop
      // toolbar, so scope the assertion to the visible one.)
      const hint = page.getByText(/drag to paint a zone · map locked/i).filter({ visible: true });
      await page.getByRole('button', { name: /area — drag to paint a zone/i }).click();
      await expect(hint).toHaveCount(1);

      // Flipping back to Tap exits paint mode (hint gone).
      await tapToggle.click();
      await expect(tapToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(hint).toHaveCount(0);
    });
  });

  test.describe('freehand draw method — fine pointer (desktop)', () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

    test('Draw method toggle is NOT rendered on a desktop viewport', async ({ page }) => {
      await page.goto('/dashboard/measure');
      // The tool itself still loads (address search visible)…
      await expect(
        page.getByRole('textbox', { name: /address to measure/i }),
      ).toBeVisible({ timeout: 15_000 });
      // …but the freehand Draw toggle is absent on a fine-pointer device.
      await expect(
        page.getByRole('button', { name: /draw — drag your finger to trace freehand/i }),
      ).toHaveCount(0);
    });
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
