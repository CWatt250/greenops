-- Migration 041: Per-job time windows.
-- Lets dispatchers say "customer needs this between 9–11am" on a single job.
-- VROOM consumes the window as epoch seconds at optimize-time; null on both
-- columns means "flexible — anytime during the crew's workday."

alter table jobs
  add column if not exists time_window_start time,
  add column if not exists time_window_end   time;

-- If both are set, end must be later than start. Either side can stay null
-- (e.g., "must end before noon" without a hard start).
alter table jobs
  drop constraint if exists jobs_time_window_check;
alter table jobs
  add constraint jobs_time_window_check
  check (
    time_window_start is null
    or time_window_end is null
    or time_window_end > time_window_start
  );
