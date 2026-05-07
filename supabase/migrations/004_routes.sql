create table routes (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  crew_id uuid references crews(id) on delete set null,
  route_date date not null,
  title text,
  status text check (status in ('draft','active','in_progress','complete')) default 'draft',
  total_drive_minutes int,
  total_job_minutes int,
  total_stops int,
  optimized_at timestamptz,
  weather_checked_at timestamptz,
  weather_summary text,
  weather_flag boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table route_stops (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid references routes(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete cascade not null,
  stop_order int not null,
  estimated_arrival time,
  estimated_duration_minutes int,
  drive_minutes_from_prev int,
  drive_distance_miles numeric(6,2),
  status text check (status in ('pending','en_route','arrived','complete','skipped')) default 'pending',
  actual_arrival timestamptz,
  actual_departure timestamptz,
  created_at timestamptz default now()
);

alter table routes enable row level security;
alter table route_stops enable row level security;

create policy "Company members can manage routes"
  on routes for all using (company_id in (
    select company_id from profiles where id = auth.uid()
  ));

create policy "Company members can manage route_stops"
  on route_stops for all using (route_id in (
    select id from routes where company_id in (
      select company_id from profiles where id = auth.uid()
    )
  ));
