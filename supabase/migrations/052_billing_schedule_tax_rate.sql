-- 052: billing_schedules carry a tax rate.
--
-- The recurring-invoice cron (generate-recurring-invoices) hardcoded
-- taxRate = 0 because schedules had nowhere to store one, so every
-- auto-generated invoice shipped tax-free regardless of what the office
-- charges that client by hand. Add the column (decimal form, matching
-- invoices.tax_rate per migration 031) and backfill each schedule from the
-- client's most recent invoice so existing contracts keep charging what
-- the office last charged.
--
-- Idempotent. Apply to prod (same as 046-051).

alter table billing_schedules
  add column if not exists tax_rate numeric(5,4) not null default 0;

comment on column billing_schedules.tax_rate is
  'Decimal tax rate applied to invoices this schedule generates. 0.085 means 8.5%.';

update billing_schedules bs
   set tax_rate = coalesce(
     (select i.tax_rate
        from invoices i
       where i.client_id = bs.client_id
         and i.company_id = bs.company_id
       order by i.issued_date desc, i.created_at desc
       limit 1),
     0)
 where bs.tax_rate = 0;
