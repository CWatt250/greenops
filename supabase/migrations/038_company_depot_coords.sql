-- Migration 038: Company depot coords + drive-order metadata on jobs.
-- Locks route start/end to the company's HQ ("depot") and lets us pre-compute
-- a drive-optimal ordering of today's jobs along with per-leg drive time and
-- distance, so the crew app on /today can render the day in proper order with
-- "X min from previous" annotations.

alter table companies
  add column if not exists depot_latitude  numeric(10,7),
  add column if not exists depot_longitude numeric(10,7),
  add column if not exists depot_address   text;

alter table jobs
  add column if not exists route_order                       integer,
  add column if not exists drive_minutes_from_previous       integer,
  add column if not exists drive_distance_miles_from_previous numeric(10,2),
  add column if not exists eta_minutes                       integer,
  add column if not exists en_route_at                       timestamptz;

-- Expand the jobs.status check to include 'en_route'. The constraint was
-- created inline in 001 with no explicit name, so we look it up dynamically.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
    from pg_constraint
   where conrelid = 'public.jobs'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%status%in%scheduled%';

  if v_constraint is not null then
    execute format('alter table jobs drop constraint %I', v_constraint);
  end if;

  -- On Postgres 17 the inline check from 001 is auto-named `jobs_status_check`,
  -- which the `status in (...)` pattern above misses (it is normalized to
  -- `= ANY (ARRAY[...])`). Drop it explicitly so the re-add can't collide.
  execute 'alter table jobs drop constraint if exists jobs_status_check';

  alter table jobs
    add constraint jobs_status_check
    check (status in (
      'unscheduled','scheduled','en_route','in_progress','complete','cancelled','issue'
    ));
end$$;

-- Expand clock_events.event_type to allow whole-shift events. job_id must be
-- nullable for shift events since they aren't tied to a specific job.
alter table clock_events
  alter column job_id drop not null;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
    from pg_constraint
   where conrelid = 'public.clock_events'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%event_type%in%clock_in%';

  if v_constraint is not null then
    execute format('alter table clock_events drop constraint %I', v_constraint);
  end if;

  execute 'alter table clock_events drop constraint if exists clock_events_event_type_check';

  alter table clock_events
    add constraint clock_events_event_type_check
    check (event_type in ('clock_in','clock_out','shift_start','shift_end'));
end$$;

create index if not exists idx_jobs_route_order
  on jobs(company_id, scheduled_date, crew_id, route_order)
  where route_order is not null;

create index if not exists idx_clock_events_shift_lookup
  on clock_events(profile_id, event_type, created_at);
