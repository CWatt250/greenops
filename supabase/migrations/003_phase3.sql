-- Phase 3: clock_events, job_photos, notifications

-- CLOCK EVENTS (GPS clock-in/out per job per crew member)
create table if not exists clock_events (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  event_type text check (event_type in ('clock_in','clock_out')) not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  notes text,
  created_at timestamptz default now()
);

alter table clock_events enable row level security;

create policy "Company members can view clock_events"
  on clock_events for select
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Company members can insert clock_events"
  on clock_events for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));

-- JOB PHOTOS
create table if not exists job_photos (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete cascade not null,
  uploaded_by uuid references profiles(id),
  storage_path text not null,
  caption text,
  created_at timestamptz default now()
);

alter table job_photos enable row level security;

create policy "Company members can view job_photos"
  on job_photos for select
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Company members can insert job_photos"
  on job_photos for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;

create policy "Users can view own notifications"
  on notifications for select
  using (profile_id = auth.uid());

create policy "Company members can insert notifications"
  on notifications for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Users can update own notifications"
  on notifications for update
  using (profile_id = auth.uid());
