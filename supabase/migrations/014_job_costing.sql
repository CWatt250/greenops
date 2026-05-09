-- Job costing — estimated vs actual labor / materials / equipment / overhead.
-- Apply via Supabase SQL editor before using the Costing tab on a job.

alter table jobs add column if not exists estimated_labor_hours numeric(8, 2) default 0;
alter table jobs add column if not exists estimated_labor_cost numeric(10, 2) default 0;
alter table jobs add column if not exists estimated_materials_cost numeric(10, 2) default 0;
alter table jobs add column if not exists estimated_equipment_cost numeric(10, 2) default 0;
alter table jobs add column if not exists estimated_overhead_cost numeric(10, 2) default 0;
alter table jobs add column if not exists estimated_total_cost numeric(10, 2) default 0;
alter table jobs add column if not exists actual_labor_hours numeric(8, 2) default 0;
alter table jobs add column if not exists actual_labor_cost numeric(10, 2) default 0;
alter table jobs add column if not exists actual_materials_cost numeric(10, 2) default 0;
alter table jobs add column if not exists actual_equipment_cost numeric(10, 2) default 0;
alter table jobs add column if not exists actual_overhead_cost numeric(10, 2) default 0;
alter table jobs add column if not exists actual_total_cost numeric(10, 2) default 0;
alter table jobs add column if not exists revenue numeric(10, 2) default 0;
alter table jobs add column if not exists profit numeric(10, 2) default 0;
alter table jobs add column if not exists profit_margin_pct numeric(5, 2) default 0;

create table if not exists job_cost_entries (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete cascade not null,
  category text check (category in ('material', 'equipment', 'other')) not null,
  description text not null,
  quantity numeric(10, 2) default 1,
  unit_cost numeric(10, 2) default 0,
  total_cost numeric(10, 2) generated always as (quantity * unit_cost) stored,
  added_by uuid references profiles(id),
  added_at timestamptz default now()
);

alter table job_cost_entries enable row level security;
create policy "Company members can manage cost entries"
  on job_cost_entries for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

alter table crew_members add column if not exists hourly_rate numeric(8, 2) default 25;
alter table crew_members add column if not exists labor_burden_pct numeric(5, 2) default 25;

alter table companies add column if not exists overhead_pct numeric(5, 2) default 15;

create index if not exists idx_job_cost_entries_job on job_cost_entries(job_id);
