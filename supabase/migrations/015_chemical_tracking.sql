-- Chemical / pesticide tracking — required for WSDA + EPA compliance.
-- Apply via Supabase SQL editor before using /dashboard/chemicals.

create table if not exists chemical_products (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  manufacturer text,
  epa_registration_number text,
  active_ingredient text,
  product_type text check (product_type in (
    'herbicide','insecticide','fungicide','fertilizer','growth_regulator','other'
  )),
  default_rate numeric(8, 4),
  rate_unit text default 'oz_per_gal',
  reentry_interval_hours integer default 0,
  sds_url text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists applicator_licenses (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  license_number text not null,
  license_type text,
  state text default 'WA',
  issued_date date,
  expiration_date date,
  created_at timestamptz default now()
);

create table if not exists chemical_applications (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade not null,
  product_id uuid references chemical_products(id) not null,
  applicator_id uuid references profiles(id) not null,
  applied_at timestamptz not null default now(),
  target_pest text,
  area_treated_sqft numeric(10, 2),
  amount_applied numeric(10, 4) not null,
  amount_unit text not null,
  dilution_rate text,
  total_solution_gallons numeric(8, 2),
  weather_temp_f integer,
  weather_wind_mph integer,
  weather_conditions text,
  site_address text,
  reentry_until timestamptz,
  notes text,
  created_at timestamptz default now()
);

alter table chemical_products enable row level security;
alter table applicator_licenses enable row level security;
alter table chemical_applications enable row level security;

create policy "Company members can manage products"
  on chemical_products for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create policy "Members can view their licenses"
  on applicator_licenses for select
  using (
    profile_id = auth.uid() or
    profile_id in (
      select id from profiles where company_id in (
        select company_id from profiles where id = auth.uid()
      )
    )
  );

create policy "Members can manage their own licenses"
  on applicator_licenses for all
  using (profile_id = auth.uid());

create policy "Company members can manage applications"
  on chemical_applications for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

create index if not exists idx_chem_apps_client on chemical_applications(client_id);
create index if not exists idx_chem_apps_job on chemical_applications(job_id);
create index if not exists idx_chem_apps_applicator on chemical_applications(applicator_id);
