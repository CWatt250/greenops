-- Proposal Builder columns and presets table.
-- Apply via Supabase SQL editor before using /dashboard/proposals/new.

alter table estimates
  add column if not exists property_complexity text
    check (property_complexity in ('simple','moderate','complex'))
    default 'simple';

alter table estimates add column if not exists has_slopes boolean default false;
alter table estimates add column if not exists has_dogs boolean default false;
alter table estimates add column if not exists has_obstacles boolean default false;
alter table estimates add column if not exists payment_terms text default 'Net 30';
alter table estimates add column if not exists annual_value numeric(10,2);

alter table estimate_line_items
  add column if not exists frequency text
    check (frequency in ('one_time','weekly','biweekly','monthly','seasonal','annual'))
    default 'one_time';

alter table estimate_line_items
  add column if not exists frequency_discount_pct numeric(5,2) default 0;

create table if not exists service_presets (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  description text,
  service_ids uuid[] not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table service_presets enable row level security;

create policy "Company members can manage presets"
  on service_presets for all
  using (company_id in (select company_id from profiles where id = auth.uid()));
