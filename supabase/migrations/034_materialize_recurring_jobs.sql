-- Recurring job materialization. Today, "every Monday mowing" is stored as
-- ONE jobs row with `is_recurring=true` and a `recurrence_rule` string —
-- the schedule view never sees future Mondays because it filters on
-- `scheduled_date`. We switch to a materialized model: a parent row with
-- the rule + a series of child rows, one per occurrence.

alter table jobs add column if not exists is_recurring_parent boolean default false;
alter table jobs add column if not exists recurring_parent_id uuid references jobs(id) on delete cascade;
-- On parent rows: how far ahead we've expanded.
alter table jobs add column if not exists materialized_through date;
-- iCal RRULE string on the parent (parallels existing `recurrence_rule`).
alter table jobs add column if not exists rrule text;
-- Optional series end. NULL = "forever".
alter table jobs add column if not exists recurrence_end_date date;

create index if not exists idx_jobs_recurring_parent
  on jobs (recurring_parent_id);
create index if not exists idx_jobs_is_recurring_parent
  on jobs (is_recurring_parent) where is_recurring_parent = true;
create index if not exists idx_jobs_company_scheduled_date
  on jobs (company_id, scheduled_date);
