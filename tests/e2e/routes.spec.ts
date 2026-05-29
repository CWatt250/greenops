import { test, expect, type Route } from '@playwright/test';

/** Local YYYY-MM-DD for tomorrow — matches the seed's `current_date + 1` jobs. */
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Mirrors formatDateLabel() in the page so we can assert the state-derived UI. */
function dateLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Set the route date and WAIT until React state (not just the DOM) reflects it.
 *
 * The date <input> is a controlled React field defaulting to *today*. A bare
 * Playwright `.fill()` updates the DOM value but doesn't reliably fire the
 * controlled `onChange`, so `selectedDate` stays on today and auto-load pulls
 * the wrong day's jobs. We push the value through the native setter + an
 * `input` event (the React-aware way to signal a programmatic change), then
 * confirm via the auto-load button label, which is derived from `selectedDate`.
 */
async function setRouteDate(page: import('@playwright/test').Page, dateStr: string) {
  const dateInput = page.locator('input[type="date"]');
  await expect(dateInput).toHaveValue(/\d{4}-\d{2}-\d{2}/); // wait for hydration
  await dateInput.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, dateStr);
  await expect(dateInput).toHaveValue(dateStr);
  await expect(
    page.getByRole('button', { name: /auto-load all jobs scheduled/i }),
  ).toContainText(dateLabel(dateStr));
}

/**
 * Stub the ORS/VROOM optimization proxy (`/api/optimize-route`) the same way we
 * stub Mapbox via the `pk.placeholder` token: CI must NOT depend on the live
 * OpenRouteService API (ORS_API_KEY is empty in CI, so the real proxy 500s).
 *
 * We read the outgoing payload, REVERSE the job order, and deal the jobs across
 * the requested vehicles. Reversing guarantees the UI's reordered output is
 * provably different from the auto-load order. The response matches the real
 * ORS shape (`code`/`summary`/`routes[].steps[]`/`unassigned`), wrapped by the
 * proxy as `{ ok: true, result }` — so the UI's reorder + toast logic in
 * `handleOptimizeMulti` runs completely unchanged. See lib/vroom.ts (runOrs).
 */
async function fulfillMockVroom(route: Route): Promise<void> {
  const body = route.request().postDataJSON() as {
    vehicles: Array<{ id: number }>;
    jobs: Array<{ id: number }>;
  };
  const vehicleIds = body.vehicles.map((v) => v.id);
  const jobIds = body.jobs.map((j) => j.id).reverse();

  const perVehicle = Math.ceil(jobIds.length / Math.max(vehicleIds.length, 1));
  const routes = vehicleIds.map((vid, vi) => {
    const slice = jobIds.slice(vi * perVehicle, vi * perVehicle + perVehicle);
    return {
      vehicle: vid,
      // Real ORS bookends job steps with start/end; runOrs filters to
      // type === 'job', so the surrounding steps are ignored but kept for shape.
      steps: [
        { type: 'start' },
        ...slice.map((id) => ({ type: 'job', id })),
        { type: 'end' },
      ],
      duration: 1800 + vi * 600,
    };
  });

  const result = {
    code: 0,
    summary: {
      cost: 0,
      unassigned: 0,
      duration: routes.reduce((sum, r) => sum + r.duration, 0),
    },
    routes,
    unassigned: [],
  };

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, result }),
  });
}

/**
 * Multi-crew route optimization. The seed (020_vroom_test_seed) leaves 8
 * geocoded jobs scheduled for tomorrow, unassigned, under 2 crews. We select
 * both crews, auto-load those jobs, and run VROOM (via /api/optimize-route).
 * The proxy is mocked above so the test never touches the live ORS API.
 */
test('optimize multi-crew route → VROOM reorders stops + success toast', async ({ page }) => {
  // The auto-load + first-hit route compile on a cold dev server can take a
  // while, so allow generous headroom — this MUST exceed the assertion
  // timeouts below (the original 45s toast assertion exceeded the 30s default
  // test timeout, so it could never actually complete: that was a bug).
  test.setTimeout(60_000);

  // Intercept the optimization proxy before it can reach the (keyless) server.
  await page.route('**/api/optimize-route', fulfillMockVroom);

  await page.goto('/dashboard/routes/new');

  // Target the day the seeded jobs live on (and confirm React state took it).
  await setRouteDate(page, tomorrowStr());

  // Select every crew → switches the builder into multi-crew mode.
  await page.getByRole('button', { name: /select all crews/i }).click();
  await expect(page.getByRole('button', { name: /all selected/i })).toBeVisible();

  // Auto-load all jobs scheduled for that date as route stops.
  await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();

  // Once stops load, the multi-crew optimize button enables. Generous: stops
  // auto-load is slow on a cold dev server compiling the route on first hit.
  const optimize = page.getByRole('button', { name: /optimize routes/i });
  await expect(optimize).toBeEnabled({ timeout: 40_000 });

  // Snapshot the stop order BEFORE optimizing (auto-load order, one unassigned
  // bucket). We assert below that optimization actually reorders this.
  const stopNames = page.getByTestId('stop-client-name');
  await expect(stopNames.first()).toBeVisible();
  const before = await stopNames.allTextContents();
  expect(before.length).toBeGreaterThan(1);

  await optimize.click();

  // 1) The real success path: the "Routes optimized" toast appears. (Verified
  //    against the toast.success(...) call in app/dashboard/routes/new/page.tsx.)
  //    The mock responds instantly, so 10s is plenty — no 45s needed.
  await expect(page.getByText(/routes optimized/i)).toBeVisible({ timeout: 10_000 });

  // 2) The stop order in the UI actually changed — not just the toast. Poll so
  //    we don't race the post-optimize re-render. Same stops, different order.
  await expect
    .poll(async () => (await stopNames.allTextContents()).join('|'), { timeout: 10_000 })
    .not.toBe(before.join('|'));

  const after = await stopNames.allTextContents();
  expect([...after].sort()).toEqual([...before].sort()); // same set of stops
  expect(after).not.toEqual(before); // genuinely reordered
});
