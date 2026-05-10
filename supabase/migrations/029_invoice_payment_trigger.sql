-- Auto-recompute invoices.amount_paid / balance_due / status whenever a
-- payment row changes. Without this trigger, recording a payment never
-- decreases the invoice's stored balance, so dashboard "Outstanding"
-- and the invoice PDF/portal stay stale.

create or replace function recompute_invoice_balance()
returns trigger language plpgsql as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_due numeric;
  v_curr_status text;
begin
  if v_invoice_id is null then return null; end if;

  select total, status
    into v_total, v_curr_status
    from invoices
   where id = v_invoice_id;

  -- Invoice may have been deleted in same transaction — bail out gracefully.
  if v_total is null then return null; end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from payments
   where invoice_id = v_invoice_id;

  v_due := v_total - v_paid;

  update invoices set
    amount_paid = v_paid,
    balance_due = v_due,
    status = case
      when v_due <= 0 and v_paid > 0 then 'paid'
      when v_paid > 0 and v_due > 0  then 'partial'
      -- Don't downgrade an admin-set status (cancelled/draft/sent/viewed/overdue).
      else v_curr_status
    end,
    paid_at = case
      when v_due <= 0 and v_paid > 0 then coalesce(paid_at, now())
      else paid_at
    end,
    updated_at = now()
  where id = v_invoice_id;

  return null;
end;
$$;

drop trigger if exists trg_payments_recompute on payments;

create trigger trg_payments_recompute
  after insert or update or delete on payments
  for each row execute function recompute_invoice_balance();

-- Backfill: fix any existing invoices whose balance/status are out of sync
-- with their recorded payments (everything created before this trigger).
update invoices i set
  amount_paid  = coalesce(p.sum_amt, 0),
  balance_due  = i.total - coalesce(p.sum_amt, 0),
  status = case
    when i.total - coalesce(p.sum_amt, 0) <= 0 and coalesce(p.sum_amt, 0) > 0 then 'paid'
    when coalesce(p.sum_amt, 0) > 0 then 'partial'
    else i.status
  end,
  paid_at = case
    when i.total - coalesce(p.sum_amt, 0) <= 0 and coalesce(p.sum_amt, 0) > 0
      then coalesce(i.paid_at, now())
    else i.paid_at
  end,
  updated_at = now()
from (
  select invoice_id, sum(amount) as sum_amt
    from payments group by invoice_id
) p
where p.invoice_id = i.id;
