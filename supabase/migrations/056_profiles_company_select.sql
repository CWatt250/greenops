-- 056: staff can see their company's member profiles.
--
-- 001 only allowed `auth.uid() = id`, so every cross-member join in the
-- app silently nulled: timesheet member names showed "Unknown member",
-- the chemicals license picker offered only yourself, applicator names
-- blanked, etc. crew_members (a separate table) masked this for crew
-- rosters, which is why it survived so long.
--
-- A profiles policy can't subquery profiles directly (infinite RLS
-- recursion) — hence the SECURITY DEFINER helper.
--
-- Portal customers are unaffected: they live in portal_users and have no
-- profiles row, so auth_company_id() is null for them.
--
-- Idempotent. Apply with `supabase db push`.

create or replace function auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

drop policy if exists "Company members can view company profiles" on profiles;
create policy "Company members can view company profiles"
  on profiles for select
  using (company_id = auth_company_id());
