-- Custom forms / checklists: pre-job inspections, post-job quality checks,
-- damage waivers, safety reports. Apply via Supabase SQL editor.

create table if not exists form_templates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  description text,
  trigger text check (trigger in (
    'pre_job', 'post_job', 'on_demand', 'customer_signoff'
  )) default 'on_demand',
  service_categories text[] default '{}',
  fields jsonb not null default '[]',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists form_submissions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  template_id uuid references form_templates(id) on delete set null,
  job_id uuid references jobs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  submitted_by uuid references profiles(id),
  responses jsonb not null default '{}',
  signature_url text,
  submitted_at timestamptz default now()
);

alter table form_templates enable row level security;
alter table form_submissions enable row level security;

create policy "Company members can manage form templates"
  on form_templates for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Company members can manage form submissions"
  on form_submissions for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create index if not exists idx_form_submissions_job on form_submissions(job_id);
create index if not exists idx_form_submissions_client on form_submissions(client_id);
