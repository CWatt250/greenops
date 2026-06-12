import { test, expect, type Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';
import { CREW } from './helpers/creds';

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Local YYYY-MM-DD for today — matches what the crew's /today queries. */
function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

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
  // Re-dispatch until the auto-load label (derived from React state) reflects
  // the date: a dispatch that lands before React attaches the controlled
  // onChange is silently lost — the cold-compile flake this retries away.
  await expect(async () => {
    await dateInput.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, dateStr);
    await expect(dateInput).toHaveValue(dateStr, { timeout: 1_000 });
    await expect(
      page.getByRole('button', { name: /auto-load all jobs scheduled/i }),
    ).toContainText(dateLabel(dateStr), { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
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

/**
 * The dead end found in the 2026-06 field audit: a SINGLE-crew dispatch wrote
 * routes/route_stops but never set jobs.crew_id, so the crew's /today (which
 * filters jobs by crew_id) showed an empty day. This drives the real builder
 * in single-crew mode, dispatches a job scheduled TODAY, then logs in as the
 * crew member and asserts the stop is actually visible on /today.
 */
test('dispatch a single-crew route → the crew sees the stop on /today', async ({ page, browser }) => {
  // Owner flow + a second full crew login — well past the 30s default.
  test.setTimeout(120_000);
  await page.route('**/api/optimize-route', fulfillMockVroom);

  const jobTitle = `E2E Dispatch Today ${Date.now()}`;

  // Seed a TODAY job for a geocoded client, deliberately with NO crew —
  // exactly the state the builder's auto-load picks up.
  const { data: client } = await admin
    .from('clients')
    .select('id, company_id')
    .eq('name', 'John Smith')
    .not('latitude', 'is', null)
    .limit(1)
    .maybeSingle();
  expect(client, 'seeded geocoded John Smith client must exist').toBeTruthy();
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      company_id: client!.company_id,
      client_id: client!.id,
      title: jobTitle,
      status: 'unscheduled',
      scheduled_date: todayStr(),
    })
    .select('id')
    .single();
  expect(jobErr, `today-job insert failed: ${jobErr?.message}`).toBeNull();

  try {
    await page.goto('/dashboard/routes/new');
    await setRouteDate(page, todayStr());

    // Pick exactly ONE crew → single-crew mode (the buggy path).
    await page.getByRole('button', { name: /^crew 1$/i }).first().click();

    await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();
    // The seeded stop appears (Optimize stays disabled for a single stop —
    // nothing to sequence — so dispatch directly, as a dispatcher would).
    await expect(page.getByText(jobTitle)).toBeVisible({ timeout: 40_000 });

    await page.getByRole('button', { name: /^dispatch$/i }).click();
    await expect(page.getByText(/dispatched/i).first()).toBeVisible({ timeout: 30_000 });

    // The fix under test: dispatch must have pinned the job to the crew and
    // promoted it onto the schedule.
    await expect(async () => {
      const { data } = await admin
        .from('jobs')
        .select('crew_id, status, route_order')
        .eq('id', job!.id)
        .single();
      expect(data?.crew_id, 'dispatch must set jobs.crew_id in single-crew mode').toBeTruthy();
      expect(data?.status).toBe('scheduled');
      expect(data?.route_order).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    // And the crew member can actually see the stop. Fresh logged-out context
    // (explicit baseURL + empty storageState — see announce.spec for why).
    const crewCtx = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      storageState: { cookies: [], origins: [] },
    });
    const crewPage = await crewCtx.newPage();
    try {
      await crewPage.goto('/login');
      await crewPage.locator('#email').fill(CREW.email, { timeout: 15_000 });
      await crewPage.locator('#password').fill(CREW.password, { timeout: 15_000 });
      await crewPage.getByRole('button', { name: /sign in/i }).click({ timeout: 15_000 });
      await crewPage.waitForURL(/\/today(\/|$|\?)/, { timeout: 30_000 });
      // A fresh day opens on the morning-brief gate; step through it the way
      // a worker would before the stop cards render.
      const startDay = crewPage.getByRole('button', { name: /start my day/i });
      if (await startDay.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await startDay.click();
      }
      await expect(crewPage.getByText(jobTitle)).toBeVisible({ timeout: 15_000 });
    } finally {
      await crewCtx.close();
    }
  } finally {
    // Tear down what we created (stops first — they reference the job).
    if (job?.id) {
      await admin.from('route_stops').delete().eq('job_id', job.id);
      await admin.from('jobs').delete().eq('id', job.id);
    }
  }
});

/**
 * Audit #6: a stop whose address can't be geocoded used to be silently
 * filtered out of the VROOM payload (console.warn only) — the job just never
 * got routed. Now it must surface a loud per-stop banner and disable
 * Optimize until the stop is fixed or removed.
 */
test('ungeocodable stop shows a loud banner and blocks Optimize', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const clientName = `E2E No Address ${stamp}`;
  // An isolated date no other spec auto-loads: the seed jobs live on
  // tomorrow, and this fixture must never appear in the parallel multi-crew
  // test's stop list (it would — correctly — disable that test's Optimize).
  const isolatedDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  })();

  // A client with NO coordinates and an EMPTY address: the builder's
  // auto-load skips geocoding entirely (empty string is falsy), so the stop
  // deterministically has no coords in every environment, real token or not.
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({ company_id: env.E2E_COMPANY_ID, name: clientName, service_address: '' })
    .select('id')
    .single();
  expect(clientErr, `client insert failed: ${clientErr?.message}`).toBeNull();
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      company_id: env.E2E_COMPANY_ID,
      client_id: client!.id,
      title: `E2E Ungeocodable ${stamp}`,
      status: 'unscheduled',
      scheduled_date: isolatedDate,
    })
    .select('id')
    .single();
  expect(jobErr, `job insert failed: ${jobErr?.message}`).toBeNull();

  try {
    await page.goto('/dashboard/routes/new');
    await setRouteDate(page, isolatedDate);
    await page.getByRole('button', { name: /select all crews/i }).click();
    await page.getByRole('button', { name: /auto-load all jobs scheduled/i }).click();

    // The loud banner names the broken stop and tells the dispatcher what to do.
    const banner = page.getByTestId('ungeocoded-banner');
    await expect(banner).toBeVisible({ timeout: 40_000 });
    await expect(banner).toContainText(clientName);
    await expect(banner).toContainText(/fix the address or remove the stop/i);

    // And Optimize is hard-blocked while the stop is unresolved.
    await expect(
      page.getByRole('button', { name: /optimize routes/i }),
    ).toBeDisabled();
  } finally {
    if (job?.id) {
      await admin.from('route_stops').delete().eq('job_id', job.id);
      await admin.from('jobs').delete().eq('id', job.id);
    }
    if (client?.id) await admin.from('clients').delete().eq('id', client.id);
  }
});
