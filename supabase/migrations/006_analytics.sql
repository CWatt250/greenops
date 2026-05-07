create materialized view mv_revenue_by_month as
select
  company_id,
  date_trunc('month', issued_date) as month,
  count(*) as invoice_count,
  sum(total) as gross_revenue,
  sum(amount_paid) as collected,
  sum(balance_due) as outstanding
from invoices
where status != 'cancelled'
group by company_id, date_trunc('month', issued_date);

create materialized view mv_crew_performance as
select
  j.company_id, j.crew_id, c.name as crew_name,
  date_trunc('month', j.scheduled_date::date) as month,
  count(*) as total_jobs,
  count(*) filter (where j.status = 'complete') as completed_jobs,
  count(*) filter (where j.status = 'issue') as issue_jobs,
  count(*) filter (where j.status = 'cancelled') as cancelled_jobs,
  avg(extract(epoch from (j.actual_end - j.actual_start))/60) as avg_job_minutes
from jobs j
join crews c on c.id = j.crew_id
where j.crew_id is not null and j.scheduled_date is not null
group by j.company_id, j.crew_id, c.name, date_trunc('month', j.scheduled_date::date);

create materialized view mv_client_revenue as
select
  i.company_id, i.client_id, cl.name as client_name, cl.property_type,
  count(distinct i.id) as total_invoices,
  sum(i.total) as lifetime_revenue,
  sum(i.amount_paid) as lifetime_collected,
  max(i.issued_date) as last_invoice_date,
  avg(i.total) as avg_invoice_value
from invoices i
join clients cl on cl.id = i.client_id
where i.status != 'cancelled'
group by i.company_id, i.client_id, cl.name, cl.property_type;

create materialized view mv_route_efficiency as
select
  r.company_id, r.crew_id,
  date_trunc('month', r.route_date) as month,
  count(*) as total_routes,
  avg(r.total_drive_minutes) as avg_drive_minutes,
  avg(r.total_job_minutes) as avg_job_minutes,
  avg(r.total_stops) as avg_stops,
  count(*) filter (where r.weather_flag = true) as weather_flagged
from routes r
group by r.company_id, r.crew_id, date_trunc('month', r.route_date);

create or replace function refresh_analytics()
returns void language sql as $$
  refresh materialized view mv_revenue_by_month;
  refresh materialized view mv_crew_performance;
  refresh materialized view mv_client_revenue;
  refresh materialized view mv_route_efficiency;
$$;
