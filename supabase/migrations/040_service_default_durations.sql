-- Migration 040: estimated_duration_minutes on services + jobs
--
-- Background: VROOM was getting a hard-coded 30-min service window on every
-- stop, so a 3-hour cleanup and a 30-min mow looked identical to the solver.
-- That's why crew workload balanced by stop count instead of by time.
--
-- This migration introduces a real duration field on both the services
-- catalog and the jobs table. lib/vroom.ts then resolves duration in this
-- priority order: jobs.scheduled_end − scheduled_start → sum of line-item
-- service durations → service-category default → 30-min fallback.

-- ---------------------------------------------------------------------------
-- 1) Services catalog: per-service default duration
-- ---------------------------------------------------------------------------

alter table services
  add column if not exists estimated_duration_minutes integer default 30;

-- Seed category-level defaults. Only touch rows still at the previous
-- default (30) so anything an operator has already tuned by hand stays put.
update services set estimated_duration_minutes = case
  when category = 'mowing'        then 45
  when category = 'edging'        then 30
  when category = 'cleanup'       then 180
  when category = 'fertilization' then 30
  when category = 'aeration'      then 60
  when category = 'overseeding'   then 45
  when category = 'mulch'         then 120
  when category = 'tree'          then 90
  when category = 'sprinkler'     then 60
  when category = 'snow'          then 45
  when category = 'holiday'       then 120
  else 30
end
where estimated_duration_minutes = 30;

-- ---------------------------------------------------------------------------
-- 2) Jobs: per-job override (proposal-convert + dispatcher form will set it)
-- ---------------------------------------------------------------------------

alter table jobs
  add column if not exists estimated_duration_minutes integer;
