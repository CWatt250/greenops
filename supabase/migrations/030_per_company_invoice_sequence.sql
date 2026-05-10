-- Per-company atomic invoice counter. Replaces the COUNT(*)+1001 design
-- which is both gap-prone (deletes shift everyone down) and race-unsafe
-- (concurrent calls collide).

create table if not exists invoice_number_counters (
  company_id  uuid primary key references companies(id) on delete cascade,
  last_value  bigint not null default 1000,
  updated_at  timestamptz not null default now()
);

-- Per-company invoice prefix (TLC, INV, ABC, etc.) so multi-tenant
-- white-labeling produces TLC-1001 / ABC-1001 in parallel without collision.
alter table companies
  add column if not exists invoice_prefix text not null default 'INV';

-- Seed TLC's prefix to "TLC".
update companies
   set invoice_prefix = 'TLC'
 where id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb'
   and invoice_prefix = 'INV';

-- Backfill counters: take each company's current max invoice number
-- (parsed from the trailing digits) so the first new number is +1
-- past whatever already exists. Floor at 1000 so we always start at 1001.
insert into invoice_number_counters (company_id, last_value)
select
  c.id,
  greatest(
    coalesce(
      (select max((substring(invoice_number from '\d+$'))::bigint)
         from invoices i where i.company_id = c.id),
      1000
    ),
    1000
  )
  from companies c
on conflict (company_id) do nothing;

-- Drop both old signatures so the new function is unambiguous.
drop function if exists next_invoice_number();
drop function if exists next_invoice_number(uuid);

create or replace function next_invoice_number(p_company_id uuid)
returns text language plpgsql as $$
declare
  v_next   bigint;
  v_prefix text;
begin
  -- Resolve the company's current prefix.
  select invoice_prefix into v_prefix from companies where id = p_company_id;
  v_prefix := coalesce(v_prefix, 'INV');

  -- Make sure the counter row exists, then atomic increment.
  insert into invoice_number_counters (company_id) values (p_company_id)
    on conflict (company_id) do nothing;

  update invoice_number_counters
     set last_value = last_value + 1,
         updated_at = now()
   where company_id = p_company_id
   returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;
