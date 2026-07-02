-- 053: chemical-tracking RLS gaps — brings migration 015's schema to life
-- for the /dashboard/chemicals UI.
--
-- 1. Owner/dispatcher can manage applicator licenses for anyone in their
--    company. 015 only allowed self-manage, so the office couldn't maintain
--    the license registry it's legally responsible for.
-- 2. Portal customers can read chemical applications on their own property
--    so the portal can show re-entry ("safe to re-enter after…") notices.
-- 3. Indexes for date-range reporting (WSDA export) and active-REI lookups.
--
-- Idempotent. Apply with `supabase db push`.

drop policy if exists "Office manages company licenses" on applicator_licenses;
create policy "Office manages company licenses"
  on applicator_licenses for all
  using (
    profile_id in (
      select id from profiles where company_id in (
        select company_id from profiles
        where id = auth.uid() and role in ('owner', 'dispatcher')
      )
    )
  );

drop policy if exists "Portal customers read own applications" on chemical_applications;
create policy "Portal customers read own applications"
  on chemical_applications for select
  using (
    client_id in (select client_id from portal_users where id = auth.uid())
  );

create index if not exists idx_chem_apps_applied_at
  on chemical_applications(company_id, applied_at desc);
create index if not exists idx_chem_apps_reentry
  on chemical_applications(client_id, reentry_until);
