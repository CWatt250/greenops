# QA Report — TLC Management Platform

**Date:** 2026-05-07
**Scope:** Functional completeness audit of every page in the owner dashboard, customer portal, and crew mobile, plus the highest-leverage fixes shipped in this pass.
**Method:** Static code audit via Read/Grep across `app/` and `components/`. No browser testing was performed — all findings are from source-of-truth file inspection. Citations point at file paths and line numbers as of commit pre-fix.

---

## Summary

The app's CRUD spine is uneven. **List → New** is wired everywhere (you can add things), but **Edit / Delete / Cancel / Duplicate** flows are missing in many places — and where edit links *do* exist, several point at pages that hadn't been built. There are no app-wide keyboard shortcuts, no global search, no CSV import, no team invitation flow in Settings, and no Estimates module at all. The customer portal is largely read-only — customers cannot edit submitted requests, cancel them before review, edit their profile, or delete sent messages. Crew mobile has no photo upload or post-submission edit.

This pass plugged the most visible holes around the core dispatcher CRUD; the rest is enumerated at the bottom for the next iteration.

---

## ✅ Pages already in good shape

| Page | Notes |
|---|---|
| `/dashboard` | Stat cards + recent jobs + quick actions, all working. |
| `/dashboard/clients` (list) | Search, status filter chips, empty state CTA, click-row → detail. |
| `/dashboard/clients/new` | ClientForm with zod validation, server-error toast, auto-redirect on save. |
| `/dashboard/jobs/new` | JobForm with line items, recurrence picker, zod validation. |
| `/dashboard/invoices` | Status filter, search, click-row → detail; new invoice has split-pane preview. |
| `/dashboard/invoices/[id]` | Mark paid / send / void already implemented; PDF download works. |
| `/dashboard/routes/new` | Auto-load + Mapbox geocode + VROOM optimize + drag-reorder + manual stop search (per the previous pass). |
| `/dashboard/routes/[id]` | Realtime subscription on stops + crew location, polyline rendering, weather banner. |
| `/dashboard/schedule` | Drag/drop scheduling onto crew slots, realtime updates, week navigation. |
| `/dashboard/crew` (dispatch) | Live crew + jobs view with realtime clock events. |
| `/dashboard/analytics` (+ `/revenue`, `/clients`, `/crew`) | Materialised-view-driven charts + tables; date-range pickers; CSV export on revenue page. |
| `/dashboard/billing` | Outstanding / overdue / drafts summary + recurring schedules with toggle. |
| `/dashboard/portal-admin` (+ `/requests`, `/complaints`) | Triage queues for customer-submitted items. |
| `/portal` (customer dashboard) | Next-job card, unpaid-invoice alert, quick-action grid. |
| `/portal/jobs`, `/portal/invoices`, `/portal/messages` | Read-only history surfaces, all populated. |
| `/today`, `/job/[id]`, `/complete/[id]` (crew mobile) | Mobile-first list, GPS clock-in, signature pad on completion. |

---

## 🔧 Fixed in this pass

All committed in this changeset.

1. **`/dashboard/clients/[id]/edit` — built.** Previously the Edit button on the client detail page (`app/dashboard/clients/[id]/page.tsx:75`) linked to a non-existent route. Created `app/dashboard/clients/[id]/edit/page.tsx` as a server component that loads the client and reuses the existing `ClientForm` in update mode (`initialData` prop already supported in `components/clients/client-form.tsx:90-91`).

2. **`/dashboard/jobs/[id]/edit` — built.** Same problem on the job detail page; created `app/dashboard/jobs/[id]/edit/page.tsx` that loads the job + line items + crews and feeds the existing `JobForm`.

3. **Confirm dialog primitive — added.** No `alert-dialog` shadcn primitive existed; built `components/shared/confirm-dialog.tsx` as a thin wrapper over the existing `Dialog` with destructive/non-destructive variants, busy state, and async-safe confirm.

4. **`/dashboard/services` — Edit + Delete wired.**
   - Each card now reveals Edit / Delete on hover.
   - Edit reuses the same Sheet (now context-aware: title flips to "Edit Service" when an `editingId` is set).
   - Delete uses `ConfirmDialog`; on FK violation (service referenced by jobs/invoices) the toast tells the user to mark inactive instead.
   - **Bug fix bonus:** the `base_price` input was `register('base_price')` without `valueAsNumber: true`, so the zod schema received a string and `services` insert almost certainly failed silently for non-zero prices. Now coerced.

5. **`/dashboard/crews` — Edit + Deactivate wired.**
   - Edit (pencil) and Deactivate (power-off) icon buttons on each crew row, with `title=` tooltips.
   - Edit reuses the Sheet (name + colour picker, defaults to TLC orange).
   - Deactivate is a soft delete (`is_active=false`) and refuses if there are still scheduled / in-progress / unscheduled jobs assigned — the toast names the count.

6. **Client detail — Delete wired.** New `components/clients/delete-client-button.tsx`, dropped into the detail header next to Edit. Confirm dialog references the job count and explicitly mentions "consider marking inactive instead."

7. **Job detail — Delete + Cancel + Duplicate wired.** New `components/jobs/job-actions.tsx` with three buttons:
   - **Duplicate** clones the job + line items into a new `unscheduled` job, redirects to it.
   - **Cancel** sets `status='cancelled'` (only shown when not already cancelled/complete).
   - **Delete** with confirm dialog warning that history is lost.

8. **Route detail — Delete wired.** New `components/routes/delete-route-button.tsx`. The button is suppressed once a route hits `in_progress` or `complete` so dispatchers don't accidentally remove operational/historical records. Underlying jobs are unaffected by route deletion (cascade is on `route_stops` only).

9. **Jobs empty state — got a CTA.** Was just text saying "Create your first job to get started." Now has a "+ New Job" button via `EmptyState`'s `action` prop; copy adapts to the active status filter.

10. **TLC orange already wired through `--orange` token** — service / crew / jobs new buttons that previously read `var(--color-brand-gold-raw)` now reference `var(--orange)` directly for clarity. Visual result is identical (the alias resolves to the same colour) but the new code is honest about what it's painting.

---

## ⚠️ Issues remaining — need product decisions

Listed roughly in order of dispatcher pain.

### 🔴 Customer-facing, currently impossible

1. **Customer cannot edit or cancel a submitted request before TLC reviews it** (`app/(portal)/portal/requests/page.tsx`, `components/portal/request-card.tsx`). They have to submit a *second* request asking to cancel the first. **Decision needed:** add a status check (`pending` only?) and an Edit/Cancel CTA, or document the workaround.
2. **Customer cannot delete or recall a sent message** (`components/portal/message-thread.tsx`). **Decision needed:** soft-delete with "Message removed" placeholder, hard delete, or "edit within 5 minutes" pattern?
3. **Customer profile is read-only** (`app/(portal)/portal/settings/page.tsx:77-84`). Name / phone / email render as `<p>` text, not inputs. The page even instructs the customer to email TLC to change anything. **Decision needed:** which fields can a customer self-edit (probably phone + name; email change requires re-verification)?

### 🟠 Owner-facing gaps

4. **Estimates module does not exist.** No `app/dashboard/estimates/` directory, no sidebar entry, no table type. Phase 2 in `CLAUDE.md` calls this out as planned. **Decision needed:** scope a separate build pass — schema, list/detail/new pages, and integration with invoices.
5. **Settings page is read-only.** No fields to edit company name / address / phone, no logo upload, no team invitation flow, no notification preferences, no role management. **Decision needed:** which of these unlock first? Team invites need an auth-side magic-link flow + a pending_invites table.
6. **No CSV import for clients.** `npm` has no parser library installed; no import UI. **Decision needed:** is this priority for migration off the prior toolset? If yes, recommend `papaparse` and a one-screen flow with column mapping.
7. **No bulk actions on tables.** The clients/jobs/invoices tables have no row-select checkboxes. **Decision needed:** which actions need bulk variants — bulk reassign crew, bulk archive, bulk export?
8. **Invoices are not editable after creation.** Detail view supports Mark Paid / Send / Void but no Edit Draft action. **Decision needed:** should drafts be editable until first send, frozen after?

### 🟡 Crew-facing gaps

9. **No photo upload on the crew job flow.** `app/(crew)/job/[id]/page.tsx` and `complete/[id]/page.tsx` capture signatures but no images. The redesign anticipates job photos — **decision needed:** Supabase Storage bucket + a multi-photo uploader on the complete page?
10. **No post-submission edit on completion notes.** Once Complete is submitted the form is replaced with a success screen. If the crew typo'd notes they need an office user to fix it. **Decision needed:** allow edits within N minutes, or always allow but log every edit?
11. **No "why was this flagged" indicator** when a job's status is `issue`. The badge shows but the reason text isn't surfaced. **Decision needed:** add an "issue note" field on jobs table or use the existing `notes` field with a heuristic?

### 🔵 Cross-cutting platform gaps

12. **No global search.** No header search input, no Ctrl+K palette. The shadcn `command.tsx` primitive is already installed but never mounted. **Decision needed:** scope a CommandPalette across clients/jobs/invoices.
13. **No keyboard shortcuts.** Audited via grep — only dnd-kit's `KeyboardSensor` is registered. No `Ctrl+K`, no `N` for new, no `Esc` close on most modals. **Decision needed:** worth a small focused pass.
14. **No tooltips on icon-only buttons** outside analytics charts. The crew/jobs/services pages now have new icon buttons with `title=` HTML tooltips for keyboard hover, but no proper Tooltip component. **Decision needed:** install shadcn `tooltip` + apply across icon-only actions?
15. **No accessibility audit.** Tab order, focus rings, ARIA labels on icon buttons, contrast ratios under the new orange theme — none of these have been verified against WCAG AA.
16. **No form-level autosave** anywhere. Refresh = lost form. The Routes builder has its own state but client/job/request/complaint forms drop everything on navigation.
17. **Confirm dialog is now the *only* destructive-action protection.** The route builder Save/Dispatch don't have confirms; the StatusWorkflow Mark-Complete on jobs/[id] doesn't have one. **Decision needed:** which destructive actions deserve a confirm vs. an undo-toast pattern?

---

## 💡 Recommendations for next iteration

Picked for highest user-value-per-engineering-hour:

1. **Settings → Edit company info** (4–6h). Just fields wired to `companies` table. Removes the most embarrassing "read-only static page" feeling.
2. **Customer portal → Edit/cancel pending requests** (3–4h). Single status guard + Edit/Cancel CTA on `RequestCard`. Removes the "submit a request to cancel my request" workflow.
3. **Crew photo upload on completion** (1 day). Supabase Storage bucket + multi-image input on `complete/[id]`. Pairs naturally with the signature pad.
4. **Estimates module** (2–3 days). New schema, list/detail/new, with Convert-to-Invoice action. Unblocks Phase 2 of the roadmap.
5. **Global Ctrl+K command palette** (4–6h). Mount `cmdk` once in dashboard layout, query clients/jobs/invoices by name. Massive perceived-quality jump.
6. **Team invites in Settings** (1 day). Email-link flow via Supabase Auth `inviteUserByEmail`, pending_invites table, role assignment.
7. **Tooltip primitive + a11y sweep** (4h). Install shadcn tooltip, audit icon-only buttons, fix focus rings, validate contrast.

I'd resist building keyboard shortcuts beyond Ctrl+K, CSV import, and bulk actions until at least 1–2 are validated by an actual dispatcher — they're easy to ship and easy to mis-design.

---

## What I could not verify

- **Browser-level UX.** Every change in this pass type-checks and builds, but I couldn't run an end-to-end user flow against a live Supabase. Recommend you walk: `clients/[id]/edit` save → `services` add+edit+delete → `crews` deactivate (with and without active jobs) → `jobs/[id]` cancel + duplicate + delete → `routes/[id]` delete on a draft route. Each should produce a toast and either redirect or refresh.
- **Migration 008** (from the previous route-builder pass — `route_stops_adhoc`) still needs to be applied in Supabase before saving routes that include manual stops. Nothing in this pass changes that.
- **Existing services bug.** I fixed `valueAsNumber` on `base_price` but did not regress-test the existing seeded services data — should be safe (existing rows have numeric `base_price` already), but worth eyeballing the catalog after deploy.
