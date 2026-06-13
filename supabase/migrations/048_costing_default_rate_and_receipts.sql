-- Migration 048: honest job-costing — company default labor rate + receipts,
-- and stop the auto-recompute trigger from fabricating a $25 rate.
--
-- Pairs with the 2026-06 costing pass. lib/job-costing.ts (the live job-detail
-- costing tab, covered by unit + e2e tests) is the source of truth; this keeps
-- the STORED rollup columns the profitability page reads consistent with it.
--
-- Apply via the Supabase SQL editor (same as 043-047). NOT auto-applied.

-- 1. Company default labor rate — the fallback for a clocked-in worker who has
--    no crew_members rate. Nullable + no default: "unset" must stay distinct
--    from a real number, so unrated labor is flagged rather than priced fake.
alter table companies
  add column if not exists default_hourly_rate numeric(8, 2);

-- 2. Receipt photo URL on a cost entry (crew can attach one from /complete).
alter table job_cost_entries
  add column if not exists receipt_url text;

-- 3. Rewrite the rollup so labor rate resolves crew_members.hourly_rate →
--    companies.default_hourly_rate → UNRATED. Unrated workers' hours are NOT
--    priced at a fabricated $25 (the old behaviour); instead profit_margin_pct
--    is set NULL as a "rate not set — can't compute" sentinel, mirroring
--    lib/job-costing.ts:profitSummary's rate_not_set status.
create or replace function recompute_job_profit(p_job_id uuid)
returns void language plpgsql as $$
declare
  v_company_id     uuid;
  v_revenue        numeric;
  v_default_rate   numeric;
  v_labor_hours    numeric := 0;
  v_labor_cost     numeric := 0;
  v_unrated        int     := 0;
  v_materials      numeric := 0;
  v_equipment      numeric := 0;
  v_overhead_pct   numeric;
  v_overhead       numeric;
  v_total          numeric;
  v_profit         numeric;
  v_margin         numeric;
begin
  select company_id, revenue into v_company_id, v_revenue
    from jobs where id = p_job_id;
  if v_company_id is null then return; end if;

  select coalesce(overhead_pct, 15), default_hourly_rate
    into v_overhead_pct, v_default_rate
    from companies where id = v_company_id;
  v_overhead_pct := coalesce(v_overhead_pct, 15);

  -- Pair clock_in → next clock_out per (job, profile); price each profile's
  -- hours at its own rate, else the company default, else leave it unrated.
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
    select profile_id,
           sum(extract(epoch from (coalesce(end_at, now()) - start_at)) / 3600.0) as hours
      from paired
     where start_at is not null
     group by profile_id
  ),
  costed as (
    select
      h.hours,
      coalesce(cm.hourly_rate, v_default_rate) as rate,
      coalesce(cm.labor_burden_pct, 0)         as burden_pct
    from hours_by_profile h
    left join crew_members cm on cm.profile_id = h.profile_id
  )
  select
    coalesce(sum(hours), 0),
    coalesce(sum(case when rate is not null then hours * rate * (1 + burden_pct / 100.0) end), 0),
    coalesce(sum(case when rate is null and hours > 0 then 1 else 0 end), 0)
    into v_labor_hours, v_labor_cost, v_unrated
  from costed;

  select
    coalesce(sum(case when category = 'material'  then total_cost end), 0),
    coalesce(sum(case when category = 'equipment' then total_cost end), 0)
    into v_materials, v_equipment
    from job_cost_entries
   where job_id = p_job_id;

  v_overhead := round((v_labor_cost + v_materials + v_equipment) * (v_overhead_pct / 100.0), 2);
  v_total    := round(v_labor_cost + v_materials + v_equipment + v_overhead, 2);
  v_revenue  := coalesce(v_revenue, 0);
  v_profit   := round(v_revenue - v_total, 2);

  -- Margin is NULL ("can't compute") when labor is unpriced or there's no cost
  -- data at all — never a fabricated number. Otherwise the usual formula.
  if v_unrated > 0 or v_total <= 0 or v_revenue <= 0 then
    v_margin := null;
  else
    v_margin := round((v_profit / v_revenue) * 100, 2);
  end if;

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

-- Re-run for every job with cost-relevant data so stored columns reflect the
-- new (non-fabricating) math immediately.
do $$
declare r record;
begin
  for r in
    select distinct j.id from jobs j
     where exists (select 1 from clock_events ce where ce.job_id = j.id)
        or exists (select 1 from job_cost_entries je where je.job_id = j.id)
  loop
    perform recompute_job_profit(r.id);
  end loop;
end $$;
