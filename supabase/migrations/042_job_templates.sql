-- Migration 042: Job templates — reusable job setups tied to a client.
-- Trent does the same job at the same property weekly; this lets him save
-- the full setup (service, duration, line items, time window, notes,
-- default crew) and spawn a fresh job from it in one tap on the client
-- detail page.

create table if not exists job_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  service_id uuid references services(id) on delete set null,
  title text,
  notes text,
  customer_notes text,
  estimated_duration_minutes integer,
  time_window_start time,
  time_window_end   time,
  default_crew_id uuid references crews(id) on delete set null,
  default_line_items jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  times_used integer not null default 0,
  last_used_at timestamptz
);

create index if not exists idx_job_templates_client on job_templates(client_id);
create index if not exists idx_job_templates_company on job_templates(company_id);

alter table job_templates enable row level security;

-- Anyone in the company can read templates (crew may want to inspect one
-- before starting work — useful context). Manage is restricted below.
create policy "Company members read templates"
  on job_templates for select
  using (
    exists (
      select 1 from profiles
       where id = auth.uid()
         and company_id = job_templates.company_id
    )
  );

create policy "Owner/dispatcher manages templates"
  on job_templates for all
  using (
    exists (
      select 1 from profiles
       where id = auth.uid()
         and company_id = job_templates.company_id
         and role in ('owner', 'dispatcher')
    )
  )
  with check (
    exists (
      select 1 from profiles
       where id = auth.uid()
         and company_id = job_templates.company_id
         and role in ('owner', 'dispatcher')
    )
  );

-- updated_at maintenance.
create or replace function touch_job_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists job_templates_touch_updated_at on job_templates;
create trigger job_templates_touch_updated_at
  before update on job_templates
  for each row execute function touch_job_templates_updated_at();

-- Helper RPC: bump times_used + last_used_at atomically when a job is
-- spawned from a template. Called from lib/job-templates.ts after the
-- new job inserts cleanly.
create or replace function increment_template_usage(p_template_id uuid)
returns void
language sql security definer set search_path = public as $$
  update job_templates
     set times_used   = times_used + 1,
         last_used_at = now()
   where id = p_template_id;
$$;

revoke all on function increment_template_usage(uuid) from public;
grant execute on function increment_template_usage(uuid) to authenticated;
