-- Normalize tax_rate storage to decimal (0.085 means 8.5%).
--
-- Today:
--   - invoices.tax_rate is decimal (0.085) — code in invoice-form.tsx parses
--     percent input then divides by 100 before insert.
--   - estimates.tax_rate is percent (8.5)  — code in proposal-pricing.ts and
--     proposal PDF divides by 100 at compute time.
--
-- Settling on decimal everywhere matches the financial-software norm and
-- simplifies cross-feature math (proposal → invoice tax copy will be 1:1).
--
-- Anything currently > 1 must be percent form, so divide by 100. Values
-- already in decimal form (≤ 1) are left alone.

update estimates
   set tax_rate = tax_rate / 100
 where tax_rate is not null
   and tax_rate > 1;

-- Defensive: invoices should already be decimal, but a hand-edited row
-- could be wrong. Same heuristic.
update invoices
   set tax_rate = tax_rate / 100
 where tax_rate is not null
   and tax_rate > 1;

comment on column invoices.tax_rate is 'Decimal tax rate. 0.085 means 8.5%.';
comment on column estimates.tax_rate is 'Decimal tax rate. 0.085 means 8.5%.';
