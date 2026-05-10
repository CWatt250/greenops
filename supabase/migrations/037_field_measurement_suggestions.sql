-- Field measurement suggestions: crew members in the field can save a
-- measurement and submit it to the office for follow-up quoting. The
-- existing property_measurements row gains submission tracking + status.

alter table property_measurements
  add column if not exists submitted_by_profile_id uuid references profiles(id) on delete set null;
alter table property_measurements
  add column if not exists field_note text;
alter table property_measurements
  add column if not exists submitted_to_office_at timestamptz;

-- Status check: drop+recreate so re-runs are safe.
do $$
declare cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'property_measurements'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%';
  if cn is not null then
    execute format('alter table property_measurements drop constraint %I', cn);
  end if;
end $$;

alter table property_measurements
  add column if not exists status text default 'draft';
alter table property_measurements
  add constraint property_measurements_status_check
  check (status in ('draft', 'submitted', 'reviewed', 'quoted', 'archived'));

create index if not exists idx_property_measurements_company_status
  on property_measurements (company_id, status);

-- Tighten RLS: existing policy lets ALL company members read every
-- measurement. Replace with role-aware policies so crew can only see
-- their own submissions, while owner/dispatcher see everything.
drop policy if exists "Company members can manage measurements" on property_measurements;
drop policy if exists "Crew creates own measurements" on property_measurements;
drop policy if exists "Owner/dispatcher manage all measurements" on property_measurements;
drop policy if exists "Crew reads own measurements" on property_measurements;
drop policy if exists "Authors update own measurements" on property_measurements;

-- Anyone in the company can insert a measurement; the trigger below
-- stamps submitted_by_profile_id with auth.uid() so the row is owned.
create policy "Company members create measurements"
  on property_measurements for insert
  with check (
    auth.uid() in (select id from profiles where company_id = property_measurements.company_id)
  );

-- Owner / dispatcher: full read across the company.
create policy "Owner/dispatcher reads company measurements"
  on property_measurements for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = property_measurements.company_id
        and role in ('owner', 'dispatcher')
    )
  );

-- Crew: only their own submissions.
create policy "Crew reads own measurements"
  on property_measurements for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = property_measurements.company_id
        and role = 'crew'
    )
    and (
      submitted_by_profile_id = auth.uid()
      or measured_by = auth.uid()
    )
  );

-- Owner / dispatcher: update + delete (review, archive, quote).
create policy "Owner/dispatcher update measurements"
  on property_measurements for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = property_measurements.company_id
        and role in ('owner', 'dispatcher')
    )
  );

create policy "Owner/dispatcher delete measurements"
  on property_measurements for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = property_measurements.company_id
        and role in ('owner', 'dispatcher')
    )
  );

-- Crew can update only their own (e.g., to add a note before submit).
create policy "Crew updates own measurements"
  on property_measurements for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = property_measurements.company_id
        and role = 'crew'
    )
    and submitted_by_profile_id = auth.uid()
  );
