-- ============================================================
-- Migration 001: 001_initial_schema
-- ============================================================

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
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

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

-- ============================================================
-- Migration 003: 003_phase3
-- ============================================================

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

-- ============================================================
-- Migration 004: 004_routes
-- ============================================================

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

-- ============================================================
-- Migration 005: 005_billing
-- ============================================================

-- Stub estimates table (referenced by invoices FK)
create table if not exists estimates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Invoice number sequence per company
create sequence if not exists invoice_number_seq start 1000;

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete restrict not null,
  job_id uuid references jobs(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  invoice_number text not null,
  status text check (status in ('draft','sent','viewed','partial','paid','overdue','cancelled')) default 'draft',
  issued_date date not null default current_date,
  due_date date,
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,4) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,
  notes text,
  internal_notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references invoices(id) on delete cascade not null,
  service_id uuid references services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  invoice_id uuid references invoices(id) on delete cascade not null,
  amount numeric(10,2) not null,
  method text check (method in ('cash','check','card','ach','other')) not null default 'check',
  reference_number text,
  payment_date date not null default current_date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table billing_schedules (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete set null,
  recurrence_rule text not null,
  next_invoice_date date,
  auto_send boolean not null default false,
  is_active boolean not null default true,
  template_notes text,
  last_generated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table payments enable row level security;
alter table billing_schedules enable row level security;
alter table estimates enable row level security;

create policy "company_isolation" on invoices
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on invoice_line_items
  using (invoice_id in (select id from invoices where company_id = (select company_id from profiles where id = auth.uid())));
create policy "company_isolation" on payments
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on billing_schedules
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on estimates
  using (company_id = (select company_id from profiles where id = auth.uid()));

-- Helper: next invoice number for company
create or replace function next_invoice_number(p_company_id uuid)
returns text language plpgsql as $$
declare
  v_count int;
begin
  select coalesce(count(*), 0) + 1001
  into v_count
  from invoices
  where company_id = p_company_id;
  return 'INV-' || lpad(v_count::text, 4, '0');
end;
$$;

-- ============================================================
-- Migration 006: 006_analytics
-- ============================================================

create materialized view mv_revenue_by_month as
select
  company_id,
  date_trunc('month', issued_date) as month,
  count(*) as invoice_count,
  sum(total) as gross_revenue,
  sum(amount_paid) as collected,
  sum(balance_due) as outstanding
from invoices
where status != 'cancelled'
group by company_id, date_trunc('month', issued_date);

create materialized view mv_crew_performance as
select
  j.company_id, j.crew_id, c.name as crew_name,
  date_trunc('month', j.scheduled_date::date) as month,
  count(*) as total_jobs,
  count(*) filter (where j.status = 'complete') as completed_jobs,
  count(*) filter (where j.status = 'issue') as issue_jobs,
  count(*) filter (where j.status = 'cancelled') as cancelled_jobs,
  avg(extract(epoch from (j.actual_end - j.actual_start))/60) as avg_job_minutes
from jobs j
join crews c on c.id = j.crew_id
where j.crew_id is not null and j.scheduled_date is not null
group by j.company_id, j.crew_id, c.name, date_trunc('month', j.scheduled_date::date);

create materialized view mv_client_revenue as
select
  i.company_id, i.client_id, cl.name as client_name, cl.property_type,
  count(distinct i.id) as total_invoices,
  sum(i.total) as lifetime_revenue,
  sum(i.amount_paid) as lifetime_collected,
  max(i.issued_date) as last_invoice_date,
  avg(i.total) as avg_invoice_value
from invoices i
join clients cl on cl.id = i.client_id
where i.status != 'cancelled'
group by i.company_id, i.client_id, cl.name, cl.property_type;

create materialized view mv_route_efficiency as
select
  r.company_id, r.crew_id,
  date_trunc('month', r.route_date) as month,
  count(*) as total_routes,
  avg(r.total_drive_minutes) as avg_drive_minutes,
  avg(r.total_job_minutes) as avg_job_minutes,
  avg(r.total_stops) as avg_stops,
  count(*) filter (where r.weather_flag = true) as weather_flagged
from routes r
group by r.company_id, r.crew_id, date_trunc('month', r.route_date);

create or replace function refresh_analytics()
returns void language sql as $$
  refresh materialized view mv_revenue_by_month;
  refresh materialized view mv_crew_performance;
  refresh materialized view mv_client_revenue;
  refresh materialized view mv_route_efficiency;
$$;

-- ============================================================
-- Migration 007: 007_customer_portal
-- ============================================================

create table portal_users (
  id uuid primary key references auth.users on delete cascade,
  client_id uuid references clients(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  full_name text,
  phone text,
  notification_prefs jsonb default '{
    "email_job_reminder": true,
    "email_invoice": true,
    "email_request_update": true,
    "sms_crew_enroute": false
  }'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

create table service_requests (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  portal_user_id uuid references portal_users(id),
  type text check (type in ('new_service','reschedule','quote_request','cancel','seasonal','other')) not null,
  service_id uuid references services(id) on delete set null,
  title text not null,
  description text,
  preferred_date date,
  preferred_time text,
  status text check (status in ('pending','reviewing','scheduled','completed','declined')) default 'pending',
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  thread_id uuid not null default uuid_generate_v4(),
  sender_type text check (sender_type in ('portal_user','admin')) not null,
  sender_id uuid not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table complaints (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  portal_user_id uuid references portal_users(id),
  job_id uuid references jobs(id) on delete set null,
  title text not null,
  description text not null,
  photo_urls text[],
  severity text check (severity in ('low','medium','high')) default 'medium',
  status text check (status in ('open','reviewing','resolved','closed')) default 'open',
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table portal_notifications (
  id uuid primary key default uuid_generate_v4(),
  portal_user_id uuid references portal_users(id) on delete cascade not null,
  title text not null,
  body text,
  type text check (type in (
    'job_scheduled','crew_enroute','job_complete',
    'invoice_ready','request_update','complaint_update','message'
  )),
  entity_type text,
  entity_id uuid,
  read boolean default false,
  created_at timestamptz default now()
);

alter table portal_users enable row level security;
alter table service_requests enable row level security;
alter table messages enable row level security;
alter table complaints enable row level security;
alter table portal_notifications enable row level security;

create policy "Portal users can view own profile" on portal_users for select using (id = auth.uid());
create policy "Portal users can update own profile" on portal_users for update using (id = auth.uid());

create policy "Portal users can manage own requests" on service_requests for all
  using (portal_user_id = auth.uid());
create policy "Company admins can manage all requests" on service_requests for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Portal users can view own messages" on messages for select
  using (client_id in (select client_id from portal_users where id = auth.uid()));
create policy "Portal users can insert own messages" on messages for insert
  with check (sender_type = 'portal_user' and sender_id = auth.uid());
create policy "Company admins can manage all messages" on messages for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Portal users can manage own complaints" on complaints for all
  using (portal_user_id = auth.uid());
create policy "Company admins can manage all complaints" on complaints for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Portal users can view own notifications" on portal_notifications for select
  using (portal_user_id = auth.uid());
create policy "Portal users can update own notifications" on portal_notifications for update
  using (portal_user_id = auth.uid());

