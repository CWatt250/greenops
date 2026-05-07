-- ESTIMATES
create table estimates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  status text check (status in ('draft','sent','accepted','declined','expired')) default 'draft',
  valid_until date,
  notes text,
  tax_rate numeric(5,2) default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ESTIMATE LINE ITEMS
create table estimate_line_items (
  id uuid primary key default uuid_generate_v4(),
  estimate_id uuid references estimates(id) on delete cascade not null,
  service_id uuid references services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) default 1,
  unit_price numeric(10,2) not null,
  markup_pct numeric(5,2) default 0,
  discount_pct numeric(5,2) default 0,
  total numeric(10,2) generated always as (
    quantity * unit_price * (1 + markup_pct/100) * (1 - discount_pct/100)
  ) stored,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- JOB SERIES (recurring jobs)
create table job_series (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  crew_id uuid references crews(id) on delete set null,
  title text not null,
  rrule text not null,
  start_date date not null,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Link jobs to estimates and series
alter table jobs add column if not exists estimate_id uuid references estimates(id);
alter table jobs add column if not exists series_id uuid references job_series(id);

-- RLS
alter table estimates enable row level security;
alter table estimate_line_items enable row level security;
alter table job_series enable row level security;

create policy "Company members can manage estimates"
  on estimates for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Company members can manage estimate line items"
  on estimate_line_items for all
  using (estimate_id in (
    select id from estimates where company_id in (
      select company_id from profiles where id = auth.uid()
    )
  ));

create policy "Company members can manage job series"
  on job_series for all
  using (company_id in (select company_id from profiles where id = auth.uid()));
