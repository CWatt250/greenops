-- Auto-recompute job profit/cost rollup whenever clock_events or
-- job_cost_entries change for the job. Today the dispatcher must click
-- "Save snapshot" on the costing tab — if they don't, the job is invisible
-- to the profitability page even though the data is there.
--
-- Formula matches lib/job-costing.ts:
--   labor_cost = Σ (hours × hourly_rate × (1 + burden/100))
--   actual_total_cost = labor + materials + equipment + overhead
--   overhead = (labor + materials + equipment) × company.overhead_pct / 100
--   profit = revenue - actual_total_cost
--   profit_margin_pct = profit / revenue × 100  (0 when revenue = 0)

create or replace function recompute_job_profit(p_job_id uuid)
returns void language plpgsql as $$
declare
  v_company_id     uuid;
  v_revenue        numeric;
  v_labor_hours    numeric := 0;
  v_labor_cost     numeric := 0;
  v_materials      numeric := 0;
  v_equipment      numeric := 0;
  v_overhead_pct   numeric;
  v_overhead       numeric;
  v_total          numeric;
  v_profit         numeric;
  v_margin         numeric;
begin
  select company_id, revenue
    into v_company_id, v_revenue
    from jobs
   where id = p_job_id;

  if v_company_id is null then return; end if;

  -- Overhead % from the company (default 15 if null).
  select coalesce(overhead_pct, 15)
    into v_overhead_pct
    from companies
   where id = v_company_id;
  v_overhead_pct := coalesce(v_overhead_pct, 15);

  -- Labor: pair clock_in / clock_out events per (job, profile), use latest
  -- clock_out per clock_in. We sum each pair's hours × rate × (1 + burden).
  with paired as (
    select
      ci.profile_id,
      ci.created_at as start_at,
      (
        select min(co.created_at)
          from clock_events co
         where co.job_id = ci.job_id
           and co.profile_id = ci.profile_id
           and co.event_type = 'clock_out'
           and co.created_at > ci.created_at
      ) as end_at
    from clock_events ci
    where ci.job_id = p_job_id
      and ci.event_type = 'clock_in'
  ),
  hours_by_profile as (
    select
      profile_id,
      sum(extract(epoch from (coalesce(end_at, now()) - start_at)) / 3600.0) as hours
    from paired
    where start_at is not null
    group by profile_id
  ),
  costed as (
    select
      h.profile_id,
      h.hours,
      coalesce(cm.hourly_rate, 25)        as rate,
      coalesce(cm.labor_burden_pct, 25)   as burden_pct
    from hours_by_profile h
    left join crew_members cm on cm.profile_id = h.profile_id
  )
  select
    coalesce(sum(hours), 0),
    coalesce(sum(hours * rate * (1 + burden_pct / 100.0)), 0)
    into v_labor_hours, v_labor_cost
  from costed;

  -- Materials and equipment from job_cost_entries.
  select
    coalesce(sum(case when category = 'material'  then total_cost end), 0),
    coalesce(sum(case when category = 'equipment' then total_cost end), 0)
    into v_materials, v_equipment
    from job_cost_entries
   where job_id = p_job_id;

  -- Overhead allocation matches lib/job-costing.ts:applyOverhead().
  v_overhead := round((v_labor_cost + v_materials + v_equipment) * (v_overhead_pct / 100.0), 2);
  v_total    := round(v_labor_cost + v_materials + v_equipment + v_overhead, 2);
  v_revenue  := coalesce(v_revenue, 0);
  v_profit   := round(v_revenue - v_total, 2);
  v_margin   := case when v_revenue > 0 then round((v_profit / v_revenue) * 100, 2) else 0 end;

  update jobs set
    actual_labor_hours    = round(v_labor_hours, 2),
    actual_labor_cost     = round(v_labor_cost, 2),
    actual_materials_cost = round(v_materials, 2),
    actual_equipment_cost = round(v_equipment, 2),
    actual_overhead_cost  = v_overhead,
    actual_total_cost     = v_total,
    profit                = v_profit,
    profit_margin_pct     = v_margin,
    updated_at            = now()
  where id = p_job_id;
end;
$$;

create or replace function trg_recompute_from_clock_events()
returns trigger language plpgsql as $$
declare v_job_id uuid := coalesce(new.job_id, old.job_id);
begin
  if v_job_id is not null then perform recompute_job_profit(v_job_id); end if;
  return null;
end; $$;

create or replace function trg_recompute_from_cost_entries()
returns trigger language plpgsql as $$
declare v_job_id uuid := coalesce(new.job_id, old.job_id);
begin
  if v_job_id is not null then perform recompute_job_profit(v_job_id); end if;
  return null;
end; $$;

drop trigger if exists trg_clock_events_recompute_profit on clock_events;
drop trigger if exists trg_job_cost_entries_recompute_profit on job_cost_entries;

create trigger trg_clock_events_recompute_profit
  after insert or update or delete on clock_events
  for each row execute function trg_recompute_from_clock_events();

create trigger trg_job_cost_entries_recompute_profit
  after insert or update or delete on job_cost_entries
  for each row execute function trg_recompute_from_cost_entries();

-- Backfill: refresh every job that already has cost-relevant data so the
-- profitability page populates without requiring a "Save snapshot" click.
do $$
declare r record;
begin
  for r in
    select distinct j.id
      from jobs j
     where exists (select 1 from clock_events ce where ce.job_id = j.id)
        or exists (select 1 from job_cost_entries je where je.job_id = j.id)
  loop
    perform recompute_job_profit(r.id);
  end loop;
end $$;
