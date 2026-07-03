# TLC Management Platform — 10x Value Roadmap

*Prepared 2026-07-02, based on a full codebase audit (51 migrations, dashboard + crew PWA + customer portal).*

## Where the product stands

The platform is operationally deep and genuinely good at running the day: VROOM multi-crew route optimization with skills and time windows, a crew PWA with GPS clock-in and atomic job completion, trigger-driven job costing with honest margins, recurring jobs/invoices on cron, a customer portal with two-way messaging, and Mapbox property measurement.

What it **cannot** do defines the 10x opportunity:

1. **It can't move money.** No payment processor exists. Customers see "Online payments coming soon" (`app/(portal)/portal/invoices/[id]/page.tsx:109`). Every payment is typed in by office staff.
2. **It can't reach anyone.** No email/SMS/push provider is installed. "Sending" an invoice opens `mailto:`; "sending" a proposal flips a DB status and nothing leaves the building. Notification preferences exist in the portal UI but nothing consumes them.
3. **Proposals never reach the customer.** Staff click Accept on the customer's behalf. No public link, no e-signature, no deposit.
4. **Chemical compliance is schema-only.** Migration `015_chemical_tracking.sql` built EPA-grade tables (products, applicator licenses, applications, re-entry intervals) but no UI was ever built — a real WSDA compliance hole for a WA landscaping company.
5. **It's a single-tenant install, not a sellable product.** No self-serve company signup; tenants are provisioned by SQL seed.

The multiplier logic: today the app saves the office time. Once customers can receive, approve, and pay through it, it starts **generating revenue and collapsing days of AR into minutes** — that's the difference between a tool and a platform.

---

## Tier 0 — Foundation: Communications Engine (1–2 weeks)

Everything in Tiers 1–2 needs a way to deliver messages. Build this once, first.

### F0.1 Transactional email service (Resend + React Email)

Server-side `lib/notifications/` module: templated email sends, an `email_log` table, and a dispatch function that reads `portal_users.notification_prefs` / staff prefs before sending.

**Acceptance criteria**
- [ ] `sendEmail({ to, template, data, companyId })` server utility exists; API routes and crons can call it — never client-side.
- [ ] Every send writes an `email_log` row (company_id, recipient, template, status, provider_id, error); failures are visible in a settings page list.
- [ ] Branded base template uses the company's logo (logos bucket already exists) and brand tokens.
- [ ] `portal_users.notification_prefs` is actually consumed: a customer with `invoice_ready: false` receives no invoice email; toggling it in portal settings changes behavior without redeploy.
- [ ] Worker invite (`app/api/invite-worker`) and portal invite gain a server-sent email path; the dispatcher's-phone `sms:`/`mailto:` flow remains as fallback.
- [ ] All emails include an unsubscribe/manage-preferences link that deep-links to portal settings.
- [ ] Dead enum values come alive: `job_scheduled` and `invoice_ready` portal notifications are produced when a job is scheduled / an invoice is issued (in-app row + email in one dispatch call).

### F0.2 Notification dispatch abstraction

One `notify()` entry point that fans out to in-app (existing tables), email, and later SMS/push, per recipient preference.

**Acceptance criteria**
- [ ] Existing producers (en-route, job complete, request/complaint status, broadcast) are migrated to `notify()`; no producer writes `notifications`/`portal_notifications` directly anymore.
- [ ] Channel failures are independent — an email provider outage still writes the in-app row.
- [ ] Unit tests cover preference filtering and channel fan-out.

---

## Tier 1 — Close the Money Loop (4–6 weeks) — the 10x core

### F1.1 Online payments (Stripe)

Stripe Connect-ready but single-account first. Portal "Pay Now" on invoices; webhook writes to the existing `payments` table so the battle-tested balance trigger (`029_invoice_payment_trigger.sql`) does the rest.

**Acceptance criteria**
- [ ] Customer opens an unpaid invoice in the portal and pays by card/ACH via Stripe Checkout or Payment Element; on success the invoice shows paid/partial within 10s without manual entry.
- [ ] Stripe webhook (`/api/webhooks/stripe`, signature-verified) inserts a `payments` row (`method='card'|'ach'`, reference = payment intent ID); the existing trigger recomputes `amount_paid`/`balance_due`/`status`. Duplicate webhook deliveries are idempotent.
- [ ] Partial payments and overpayment are handled (overpay blocked at checkout; amount pre-filled with balance due, editable down to a configurable minimum).
- [ ] Refunds issued in Stripe flow back as negative payment rows and reopen the invoice balance correctly.
- [ ] Card fees: company setting to absorb or surcharge (where legal); surcharge appears as a line item.
- [ ] Payment receipt email sent via F0.1.
- [ ] Manual recording (`payment-form.tsx`) still works unchanged for cash/check.
- [ ] E2E test: seed invoice → pay with Stripe test card → assert status/balance/payment row/email log.

### F1.2 Card-on-file + autopay for recurring billing

**Acceptance criteria**
- [ ] Customer can save a payment method in portal settings (Stripe SetupIntent; only last4/brand stored locally).
- [ ] A `billing_schedule` can be set to autopay; the recurring-invoice cron charges the saved method after generating the invoice and marks it paid — zero human touches for a weekly mowing client.
- [ ] Charge failures notify office + customer (F0), retry on a schedule (e.g., days 1/3/7), and fall back to a normal "pay now" email.
- [ ] Autopay requires explicit customer consent recorded with timestamp.

### F1.3 Customer-facing proposals: public link, e-signature, deposit — ✅ SHIPPED 2026-07-02 (except deposit → needs Stripe, and emailed delivery → needs F0.1; link is copy/text for now)

**Acceptance criteria**
- [ ] "Send" on a proposal generates a tokenized public URL (no login required; token ≥128 bits, revocable, expires with the proposal's `valid_until`) and emails it to the client.
- [ ] Public page renders the proposal (reuse pricing/PDF data), lets the client **Accept with a drawn signature** (`react-signature-canvas` already in deps) or Decline with a reason.
- [ ] Acceptance stores signature image, name, timestamp, IP; status flips to accepted; office gets notified; the existing convert-to-job flow can run (optionally auto-run on acceptance — company setting).
- [ ] Optional deposit: proposal can require N% / $X on acceptance; client pays via Stripe in the same flow; deposit is recorded and later applied as a credit line on the first invoice.
- [ ] Views are tracked (proposal `viewed_at`, status `sent → viewed → accepted/declined`).
- [ ] Staff-side manual Accept/Decline remains for phone/handshake deals.

### F1.4 Invoice delivery + dunning + AR aging

The UI already *claims* "Mark Paid… stops dunning emails" (`app/dashboard/invoices/page.tsx:76`) — make it true.

**Acceptance criteria**
- [ ] "Send invoice" emails the customer a branded email with PDF attachment and a portal/pay link (replaces `mailto:`); `sent_at` recorded; opening the link marks status `viewed`.
- [ ] Recurring-invoice cron sends the email when `auto_send` is on (today it only flips status).
- [ ] Dunning cron: configurable reminder ladder (e.g., due−3d, due, +7d, +14d, then weekly); stops immediately on paid/cancelled; per-invoice opt-out; every send logged.
- [ ] AR aging report page: buckets (current/1–30/31–60/61–90/90+) by client, drill-down to invoices, CSV export.
- [ ] Fix: recurring invoices inherit a tax rate from the billing schedule or company default instead of the current hardcoded `taxRate = 0` (`app/api/cron/generate-recurring-invoices/route.ts`).

**Tier 1 outcome:** quote → e-sign → deposit → work → invoice → autopay/dunning runs end-to-end with zero office keystrokes. This is the single biggest value multiplier in the roadmap.

---

## Tier 2 — Reach People Where They Are (2–3 weeks)

### F2.1 SMS (Twilio)

**Acceptance criteria**
- [ ] "Crew En Route" SMS with ETA fires from the existing en-route flow (`app/api/jobs/[id]/en-route`) when the customer's `sms_crew_enroute` pref is on — remove the "Coming soon" disabled state in portal settings.
- [ ] Appointment-tomorrow reminder SMS (cron, respects prefs and quiet hours 8am–8pm local).
- [ ] Payment/invoice links can be sent by SMS.
- [ ] STOP/opt-out handled via Twilio webhook and reflected in prefs; all sends logged like email.
- [ ] A2P 10DLC registration documented as a launch prerequisite.

### F2.2 Web push for crews

The PWA (`public/sw.js`, manifest) exists; add push so crews get dispatches with the app closed.

**Acceptance criteria**
- [ ] Crew is prompted (once, contextually) to enable push after first clock-in; subscription stored per device.
- [ ] Route dispatched / job added / rain-delay broadcast trigger push that opens the relevant `(crew)` page on tap.
- [ ] Works installed-PWA on Android and iOS ≥16.4; graceful no-op where unsupported.
- [ ] Delivery failures fall back to in-app notification (already exists) — never silent loss.

---

## Tier 3 — Field Depth & Compliance (3–5 weeks)

### F3.1 Chemical application tracking UI ⚠️ compliance — ✅ SHIPPED 2026-07-02

The schema (migration 015: EPA reg #s, applicator licenses, re-entry intervals, weather-at-application) is complete and RLS'd — build the missing product.

**Acceptance criteria**
- [ ] `/dashboard/chemicals`: product catalog CRUD (EPA reg #, active ingredient, REI, SDS link) and applicator license registry with expiration warnings (30/7-day banners, license-expired blocks application logging).
- [ ] Crew flow: on job completion (or standalone), a licensed applicator logs an application — product, rate, dilution, area treated (pre-fillable from property measurements), target pest; weather auto-captured from the existing OpenWeatherMap integration.
- [ ] Re-entry interval computed and surfaced: portal shows "treated — safe to re-enter after X" to the customer; crew app warns if a job is scheduled on a property still inside an REI window.
- [ ] WSDA-format application report exportable (CSV/PDF) by date range — the artifact an inspector asks for.
- [ ] Pre-job form gating (existing mechanism) can require a chemical plan for spray service categories.

### F3.2 Geofenced time tracking + timesheets + payroll export

**Acceptance criteria**
- [ ] Clock-in validates GPS against the job's geocoded location (configurable radius, default 150m); out-of-range asks for a confirmation + reason and flags the event for review — never hard-blocks (rural GPS reality).
- [ ] Shift-level punch (start/end day + breaks) coexists with per-job clocks; `today` page totals reconcile the two.
- [ ] Timesheet page: per member per pay period — regular/OT hours (WA daily/weekly rules configurable), job breakdown, flagged events queue for dispatcher approval.
- [ ] Approved timesheets export CSV in Gusto/ADP-compatible format.
- [ ] Costing pipeline (`lib/job-costing.ts`) is unaffected for approved edits — edits recompute job profit via existing triggers.

### F3.3 Offline job completion — ✅ SHIPPED 2026-07-02 (materials logging offline is the remaining gap)

The offline queue (`lib/offline-queue.ts`) covers clock-in/issue-flag; completion still requires connectivity.

**Acceptance criteria**
- [ ] Crew can finish the full completion flow (photos, materials, signature, notes) with no signal; media persists in IndexedDB/Cache Storage, not localStorage.
- [ ] On reconnect, uploads replay then the atomic `complete_job()` RPC runs; UI shows queued/synced state per job; conflict (job cancelled meanwhile) surfaces an error, never silent loss.
- [ ] Airplane-mode E2E: complete two jobs offline → reconnect → both jobs complete with all media, exactly once (idempotent replay).

### F3.4 Equipment & materials basics

**Acceptance criteria**
- [ ] Equipment registry: assets with purchase/maintenance dates, assigned crew; maintenance-due reminders via F0; usage attributable to jobs for costing.
- [ ] Materials catalog with default unit costs; crew materials entry offers catalog picks (free-text stays); per-material usage reporting. (Full inventory/reorder is out of scope until demanded.)

---

## Tier 4 — Back Office & Becoming a Product (4–6 weeks)

### F4.1 QuickBooks Online sync

**Acceptance criteria**
- [ ] OAuth connect per company in settings; status visible; disconnect works.
- [ ] Customers, invoices, and payments sync one-way (platform → QBO) on create/update, with an idempotent mapping table and a sync-errors queue UI.
- [ ] Sales tax maps to a configurable QBO tax code; sync survives QBO token refresh.
- [ ] Accountant test: month of activity reconciles in QBO to the penny against the billing dashboard.

### F4.2 Self-serve company onboarding (multi-tenant SaaS)

The RLS/company_id architecture is already multi-tenant; there is simply no front door. This is what turns TLC's internal tool into Watt Systems' sellable product.

**Acceptance criteria**
- [ ] `/signup`: create account + company (name, logo, depot address auto-geocoded, overhead %, default hourly rate) with email verification; lands in an empty-but-guided dashboard using the existing welcome tour.
- [ ] Onboarding checklist: add a service (from a starter catalog per company type), add a crew, add a client, create a job — each step deep-links.
- [ ] Seed data (services, form templates, brand defaults) is created per company — no dependence on the TLC seed migrations.
- [ ] A fresh tenant sees zero rows from other companies (RLS audit re-run with a fresh-tenant test in CI).
- [ ] Subscription billing (Stripe Billing, trial + monthly tiers) gated behind a feature flag so TLC's own instance is unaffected.

### F4.3 Review & reputation loop

**Acceptance criteria**
- [ ] N hours after job completion (configurable), customer gets a "How did we do?" email/SMS; 4–5★ routes to the company's Google review link, 1–3★ opens a private complaint form (existing complaints queue).
- [ ] Per-job feedback visible on job detail and rolled into crew analytics; opt-out respected; one ask per job max.

---

## Tier 5 — Intelligence (exploratory, after Tiers 0–2)

- **Instant estimate from measurement:** measured turf/bed areas + service presets → draft proposal with per-service pricing (the pricing engine and measurement system both exist; this is glue). *AC sketch: measure a property → one click yields a draft proposal whose line quantities match measured areas.*
- **Schedule intelligence:** overlap/double-booking warnings (today absent), crew-capacity heat on schedule lanes, and "this route violates a time window" pre-checks before dispatch.
- **Weather-driven rescheduling suggestions:** existing weather flags → one-click "shift Thursday's route to Friday" with customer notifications via F0/F2.

---

## Quick wins to bundle along the way (each < 1 day)

| Fix | Where |
|---|---|
| Recurring invoices hardcode tax to 0 | `app/api/cron/generate-recurring-invoices/route.ts` |
| UI copy promises "dunning emails" that don't exist | `app/dashboard/invoices/page.tsx:76` — remove until F1.4 ships |
| Form-runner signature capture stubbed ("type the signer's name") | `components/forms/form-runner.tsx:243` — wire `react-signature-canvas`, already used in completion flow |
| Portal settings shows email toggles nothing consumes | resolved by F0.1; until then, label as pending |
| No bulk re-geocode for ungeocoded job addresses | small tool on routes page |

## Sequencing & dependencies

```
F0.1 email ─┬─▶ F1.1 Stripe ─▶ F1.2 autopay
            ├─▶ F1.3 proposals+deposit (needs F1.1 for deposit)
            ├─▶ F1.4 dunning/AR
            ├─▶ F2.1 SMS ──▶ F4.3 reviews
            └─▶ F2.2 push
F3.x are independent of the money track and can run in parallel.
F4.1 QBO after F1.1 (payments must exist to sync).
F4.2 signup after F1.x (the product you're selling is the closed loop).
```

Recommended order: **Tier 0 → F1.1 → F1.3 → F1.4 → F2.1 → F1.2 → Tier 3 (chemicals first) → Tier 4.**

**Effort at one full-time dev:** Tier 0+1 ≈ 6–8 weeks; through Tier 2 ≈ 9–11 weeks; the full roadmap is roughly a two-quarter arc.
