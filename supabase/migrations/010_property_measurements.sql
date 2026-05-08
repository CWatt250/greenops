-- Property measurements: drawn polygons + computed areas per client.
-- Apply via Supabase SQL editor before using /dashboard/measure.

create table if not exists property_measurements (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  measured_by uuid references profiles(id),
  total_turf_sqft numeric(10, 2) default 0,
  total_hardscape_sqft numeric(10, 2) default 0,
  total_bed_sqft numeric(10, 2) default 0,
  total_other_sqft numeric(10, 2) default 0,
  shapes jsonb not null default '[]'::jsonb,
  notes text,
  imagery_source text default 'mapbox-satellite',
  measured_at timestamptz default now()
);

alter table clients
  add column if not exists primary_measurement_id uuid references property_measurements(id);

alter table services
  add column if not exists per_sqft_rate numeric(8, 4);

alter table property_measurements enable row level security;

create policy "Company members can manage measurements"
  on property_measurements for all
  using (company_id in (select company_id from profiles where id = auth.uid()));
