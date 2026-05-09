-- Proposal-line billing-mode + custom line items + notes.
-- Apply via Supabase SQL editor before saving any proposal that uses the
-- new fields.

alter table estimate_line_items
  add column if not exists is_custom boolean default false;

alter table estimate_line_items
  add column if not exists billing_mode text
    check (billing_mode in ('per_visit', 'per_month'))
    default 'per_visit';

alter table estimate_line_items
  add column if not exists monthly_rate numeric(10, 2);

alter table estimate_line_items
  add column if not exists notes text;

alter table estimate_line_items
  add column if not exists unit text;
