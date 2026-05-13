-- Migration 039: Daily summaries (end-of-day clock-out card).
-- One row per crew member per day. Populated when a worker taps "Clock Out
-- For Day" on /today. Surfaces on the owner dashboard as a crew performance
-- summary.

create table if not exists daily_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  shift_start_at timestamptz,
  shift_end_at timestamptz,
  jobs_completed integer default 0,
  worked_minutes integer default 0,
  drive_minutes integer default 0,
  drive_miles numeric(10,2),
  photos_count integer default 0,
  signatures_count integer default 0,
  measurements_count integer default 0,
  equipment_notes text,
  day_mood text check (day_mood in ('great', 'fine', 'rough')),
  created_at timestamptz not null default now(),
  unique(profile_id, date)
);

alter table daily_summaries enable row level security;

create policy "Crew reads own summaries" on daily_summaries
  for select using (auth.uid() = profile_id);

create policy "Crew inserts/updates own summaries" on daily_summaries
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "Owner/dispatcher reads company summaries" on daily_summaries
  for select using (
    exists (
      select 1 from profiles
       where id = auth.uid()
         and company_id = daily_summaries.company_id
         and role in ('owner', 'dispatcher')
    )
  );

create index if not exists idx_daily_summaries_company_date
  on daily_summaries(company_id, date desc);
