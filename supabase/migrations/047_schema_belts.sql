-- Migration 047: schema belts from the 2026-06 audit (#18 + #19).
--
--   a) UNIQUE (company_id, invoice_number) on invoices. The atomic counter
--      from migration 030 makes collisions unlikely; this makes them
--      impossible. Pre-existing duplicates are SURFACED in the exception
--      (company, number, count) instead of failing blind on the constraint.
--   b) Backfill null job_services.duration_minutes from the catalog default
--      so route duration math never live-links back to the services table.
--      (App code now always writes a non-null duration on insert; the
--      lib/vroom.ts catalog fallback remains as a warning-logged safety net.)
--
-- Idempotent. Apply to prod manually (same as 043-046).

-- a) Duplicate check first — surface offenders loudly rather than letting
--    the ADD CONSTRAINT fail with a bare unique-violation.
do $$
declare
  v_dupes text;
begin
  select string_agg(
           format('company %s: %s (%s rows)', company_id, invoice_number, n),
           E'\n')
    into v_dupes
    from (
      select company_id, invoice_number, count(*) as n
        from invoices
       group by company_id, invoice_number
      having count(*) > 1
    ) d;

  if v_dupes is not null then
    raise exception E'Cannot add UNIQUE(company_id, invoice_number) — duplicate invoice numbers exist:\n%\nRenumber these invoices first, then re-run this migration.', v_dupes;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'invoices_company_invoice_number_key'
       and conrelid = 'invoices'::regclass
  ) then
    alter table invoices
      add constraint invoices_company_invoice_number_key
      unique (company_id, invoice_number);
  end if;
end $$;

-- b) Backfill: any job_services row that never had a duration snapshot takes
--    the catalog default it would have resolved to at read time. Rows whose
--    catalog service also has no default (or is deleted) stay null — the
--    runtime chain (category default → 30m) still covers them, now with a
--    console warning so they surface.
update job_services js
   set duration_minutes = s.estimated_duration_minutes
  from services s
 where js.service_id = s.id
   and js.duration_minutes is null
   and s.estimated_duration_minutes is not null;
