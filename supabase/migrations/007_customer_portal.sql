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
