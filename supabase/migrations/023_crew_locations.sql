-- crew_locations — continuous GPS pings from crews while a job is in_progress.
-- The dispatch page reads the most recent ping per crew for a live "where
-- is the truck?" view; pings older than ~10 min indicate the worker
-- closed the app or lost signal.

create table if not exists crew_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  crew_id uuid references crews(id) on delete set null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_m numeric(10,2),
  speed_mps numeric(10,2),
  heading numeric(5,2),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_crew_locations_company_recent
  on crew_locations (company_id, recorded_at desc);

create index if not exists idx_crew_locations_profile_recent
  on crew_locations (profile_id, recorded_at desc);

alter table crew_locations enable row level security;

-- Re-runnable: drop existing policies before recreating.
drop policy if exists "Crew can insert own location" on crew_locations;
drop policy if exists "Owner/dispatcher reads company locations" on crew_locations;
drop policy if exists "Crew reads own location history" on crew_locations;

create policy "Crew can insert own location"
  on crew_locations for insert
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from profiles
      where id = auth.uid() and company_id = crew_locations.company_id
    )
  );

create policy "Owner/dispatcher reads company locations"
  on crew_locations for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and company_id = crew_locations.company_id
        and role in ('owner', 'dispatcher')
    )
  );

create policy "Crew reads own location history"
  on crew_locations for select
  using (auth.uid() = profile_id);
