-- 049: Close two RLS gaps found in the 2026-06-20 audit.
--
-- 1) `companies` had RLS ENABLED (migration 001) but ZERO policies, so normal
--    users can neither read nor write company rows. Company settings (overhead
--    %, depot, weather, logo, portal banner, business info) silently fail to
--    load/save, and a few call sites quietly fall back to hard-coded defaults,
--    masking the problem. Add scoped read (staff + portal customers) and
--    admin-only update policies. Company creation stays on the service role /
--    signup path (which bypasses RLS), so no INSERT policy is added here.
--
-- 2) `invoice_number_counters` (migration 030) had NO RLS at all. Lock it to the
--    owning company. next_invoice_number() runs SECURITY INVOKER, so a
--    company-scoped policy (not deny-all) is required for invoicing to keep
--    working — and it also blocks a user from bumping another company's counter.
--
-- All statements are idempotent (drop-if-exists before create) so the migration
-- is safe to re-run and won't collide with any policy added by hand in prod.

-- ── companies ────────────────────────────────────────────────────────────────
drop policy if exists "Members read own company" on companies;
create policy "Members read own company"
  on companies for select
  using (
    id in (select company_id from profiles where id = auth.uid())
    or id in (select company_id from portal_users where id = auth.uid())
  );

drop policy if exists "Admins update own company" on companies;
create policy "Admins update own company"
  on companies for update
  using (
    id in (
      select company_id from profiles
      where id = auth.uid() and role in ('owner', 'dispatcher')
    )
  )
  with check (
    id in (
      select company_id from profiles
      where id = auth.uid() and role in ('owner', 'dispatcher')
    )
  );

-- ── invoice_number_counters ──────────────────────────────────────────────────
alter table invoice_number_counters enable row level security;

drop policy if exists "Members manage own invoice counter" on invoice_number_counters;
create policy "Members manage own invoice counter"
  on invoice_number_counters for all
  using (company_id in (select company_id from profiles where id = auth.uid()))
  with check (company_id in (select company_id from profiles where id = auth.uid()));
