-- Convert-to-Job traceability + a 'converted' status on estimates.
--
-- The `jobs.estimate_id` column already exists from migration 002 — we
-- reuse it here as the proposal→job back-pointer rather than adding a
-- second redundant FK.

alter table estimates
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references profiles(id) on delete set null;

-- Allow status='converted' on estimates. The check constraint can't be
-- altered in place; drop and recreate.
do $$
declare cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'estimates'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%';
  if cn is not null then
    execute format('alter table estimates drop constraint %I', cn);
  end if;
end $$;

alter table estimates
  add constraint estimates_status_check
  check (status in ('draft','sent','accepted','declined','expired','converted'));
