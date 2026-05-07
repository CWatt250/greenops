-- Enable UUID
create extension if not exists "uuid-ossp";

-- COMPANIES (multi-tenant root)
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz default now()
);

-- USER PROFILES
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  company_id uuid references companies(id),
  full_name text,
  phone text,
  role text check (role in ('owner','dispatcher','crew','customer')) default 'crew',
  avatar_url text,
  created_at timestamptz default now()
);

-- CLIENTS
create table clients (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  company_name text,
  phone text,
  email text,
  preferred_contact text check (preferred_contact in ('phone','email','sms')) default 'phone',
  property_type text check (property_type in ('residential','commercial','hoa')) default 'residential',
  service_address text not null,
  service_city text,
  service_state text,
  service_zip text,
  billing_same_as_service boolean default true,
  billing_address text,
  lot_size_sqft numeric,
  access_notes text,
  gate_code text,
  preferred_crew_id uuid,
  status text check (status in ('active','inactive','prospect','lead')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SERVICES CATALOG
create table services (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  description text,
  category text check (category in (
    'mowing','edging','fertilization','aeration',
    'cleanup','tree','sprinkler','snow','holiday','other'
  )) default 'other',
  unit text check (unit in ('per_visit','per_sqft','per_hour','flat','per_unit')) default 'per_visit',
  base_price numeric(10,2) not null default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- CREWS
create table crews (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  color text default '#3D6B2C',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- CREW MEMBERS (junction)
create table crew_members (
  id uuid primary key default uuid_generate_v4(),
  crew_id uuid references crews(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text check (role in ('lead','member')) default 'member',
  created_at timestamptz default now()
);

-- JOBS
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  crew_id uuid references crews(id) on delete set null,
  title text not null,
  status text check (status in (
    'unscheduled','scheduled','in_progress','complete','cancelled','issue'
  )) default 'unscheduled',
  scheduled_date date,
  scheduled_start time,
  scheduled_end time,
  actual_start timestamptz,
  actual_end timestamptz,
  notes text,
  is_recurring boolean default false,
  recurrence_rule text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- JOB LINE ITEMS
create table job_line_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade not null,
  service_id uuid references services(id) on delete set null,
  description text,
  quantity numeric(10,2) default 1,
  unit_price numeric(10,2) not null,
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz default now()
);

-- ACTIVITY LOG
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  entity_type text,
  entity_id uuid,
  action text,
  actor_id uuid references profiles(id),
  metadata jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table companies enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table crews enable row level security;
alter table crew_members enable row level security;
alter table jobs enable row level security;
alter table job_line_items enable row level security;
alter table activity_log enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Clients policies
create policy "Company members can view clients"
  on clients for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert clients"
  on clients for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can update clients"
  on clients for update
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- Services policies
create policy "Company members can view services"
  on services for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert services"
  on services for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can update services"
  on services for update
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- Crews policies
create policy "Company members can view crews"
  on crews for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert crews"
  on crews for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can update crews"
  on crews for update
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- Crew members policies
create policy "Company members can view crew_members"
  on crew_members for select
  using (crew_id in (select id from crews where company_id in (select company_id from profiles where id = auth.uid())));
create policy "Company members can insert crew_members"
  on crew_members for insert
  with check (crew_id in (select id from crews where company_id in (select company_id from profiles where id = auth.uid())));
create policy "Company members can update crew_members"
  on crew_members for update
  using (crew_id in (select id from crews where company_id in (select company_id from profiles where id = auth.uid())));

-- Jobs policies
create policy "Company members can view jobs"
  on jobs for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert jobs"
  on jobs for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can update jobs"
  on jobs for update
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- Job line items policies
create policy "Company members can view job_line_items"
  on job_line_items for select
  using (job_id in (select id from jobs where company_id in (select company_id from profiles where id = auth.uid())));
create policy "Company members can insert job_line_items"
  on job_line_items for insert
  with check (job_id in (select id from jobs where company_id in (select company_id from profiles where id = auth.uid())));
create policy "Company members can update job_line_items"
  on job_line_items for update
  using (job_id in (select id from jobs where company_id in (select company_id from profiles where id = auth.uid())));

-- Activity log policies
create policy "Company members can view activity_log"
  on activity_log for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert activity_log"
  on activity_log for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
