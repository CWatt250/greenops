-- Allow ad-hoc route stops not tied to a job.
-- Dispatchers can add custom stops (e.g. fuel, drive-by inspections,
-- supplier pickups) directly from the route builder.

alter table route_stops
  alter column job_id drop not null;

alter table route_stops
  add column if not exists label text,
  add column if not exists address text,
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6);

-- Either the stop has a job, or it has an address. Enforce that
-- ad-hoc stops have something rendered.
alter table route_stops
  add constraint route_stops_has_target
  check (job_id is not null or address is not null);
