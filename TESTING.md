# End-to-End Testing (Playwright)

The e2e suite drives a **local** dev server against a **local** Supabase stack —
never the production project. Playwright boots `next dev` itself (with local
Supabase env injected) and runs Chromium against it.

```
tests/e2e/
  auth.setup.ts        # logs in as owner once → playwright/.auth/owner.json
  auth.spec.ts         # owner→/dashboard, crew→/today, bad creds
  clients.spec.ts      # create a client → appears in list
  jobs.spec.ts         # create a job → appears on the schedule
  routes.spec.ts       # multi-crew VROOM optimize → success toast
  proposals.spec.ts    # new prospect + custom line item → save draft
  measure.spec.ts      # measure page smoke (+ full draw flow, token-gated)
  global-setup.ts      # provisions the e2e users before every run
  helpers/             # env loader, creds
```

## One-time setup

You need **Docker** (for local Supabase) and the repo deps installed.

```bash
npm install
npx playwright install chromium          # browser binary (CI uses --with-deps)

cp .env.test.example .env.test           # local Supabase keys are pre-filled
# (optional) put a real pk.* token in NEXT_PUBLIC_MAPBOX_TOKEN and a real
# ORS_API_KEY in .env.test to enable the measure draw flow + route optimize.

npx supabase start                       # boots local Postgres + Auth + Studio
npx supabase db reset                    # applies all migrations + seed data
```

`.env.test` is gitignored. The local Supabase anon/service keys in
`.env.test.example` are the standard local-dev demo keys (identical on every
machine, only valid against `127.0.0.1:54321`) — not secrets.

The e2e users (`e2e-owner@tlc.com`, `e2e-crew@tlc.com`) are created
automatically by `tests/e2e/global-setup.ts` on every run. To (re)provision them
manually: `node scripts/seed-e2e-users.mjs`.

## Running locally

```bash
npm run test:e2e            # headless, all specs
npm run test:e2e:ui         # interactive UI mode (watch, time-travel, pick locators)
npm run test:e2e:report     # open the last HTML report
```

Useful flags:

```bash
npx playwright test clients                 # one spec by name
npx playwright test --headed                # watch the browser
npx playwright test --debug                 # step through with the inspector
npx playwright test -g "create a job"       # filter by title
```

### Already running a dev server on :3000?

The config defaults the test server to port **3000**. If you keep your own
`next dev` running there (it points at *production* Supabase via `.env.local`),
run the suite on a different port so the tests stay isolated:

```bash
E2E_PORT=3100 npm run test:e2e
```

### Debugging with UI mode

`npm run test:e2e:ui` opens the Playwright UI: pick a test, watch each step,
hover the timeline to see DOM snapshots before/after every action, and use the
locator picker to find stable selectors. Failures attach a screenshot, video,
and (on retry) a trace — open a trace with `npx playwright show-trace <zip>`.

## Reading CI results

The workflow `.github/workflows/e2e.yml` runs on every push/PR to `main`:

1. Boots local Supabase (Docker) and applies migrations.
2. Provisions the e2e users.
3. Builds nothing — it runs `next dev` via Playwright's `webServer`.
4. Runs the suite headless with `retries: 2`, `workers: 1`.

If it fails, open the run → **Summary** shows the `github` reporter annotations
inline on the failing lines. Download the **playwright-report** artifact and run
`npx playwright show-report ./playwright-report` to browse screenshots, videos,
and traces locally.

### CI secrets

Local Supabase keys are hardcoded in the workflow (they're fixtures). Set these
repo **Actions secrets** for the optional integrations:

| Secret | Enables |
|---|---|
| `ORS_API_KEY` | `routes.spec` VROOM optimization (OpenRouteService) |
| `E2E_MAPBOX_TOKEN` | the token-gated `measure` full draw flow |

Without them, `routes.spec` still runs (optimize will surface a backend error if
the key is missing) and the `measure` full-flow test auto-skips.

## Notes & limitations

- **Mapbox**: `.env.local`/`.env.test` ship a `pk.placeholder` token, so
  geocoding and satellite tiles don't load locally. The measure **smoke** test
  (page + address search render) always runs; the **full draw flow** (search →
  draw polygon → square footage) auto-skips unless a real
  `NEXT_PUBLIC_MAPBOX_TOKEN` is set.
- **Seed data**: `routes.spec` relies on `020_vroom_test_seed` — 8 geocoded
  jobs scheduled for *tomorrow* under 2 crews (company `b2ddca19…`). The route
  date is computed dynamically, so a same-day `db reset` + test run lines up.
- **Local migrations**: two seed migrations (017/020) were authored to run
  manually against production. `0165_seed_company_guard.sql` creates the seed
  company so a fresh `db reset` applies the whole chain locally.
