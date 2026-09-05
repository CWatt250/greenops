-- Tier 2 communications: SMS consent + opt-out, appointment reminders,
-- review requests, public quote requests, per-company timezone, and an
-- outbound message log (every email/SMS the app sends, with status).
--
-- Idempotent. Apply with `supabase db push`.

alter table companies add column if not exists timezone text not null default 'America/Los_Angeles';
alter table companies add column if not exists review_url text;
alter table companies add column if not exists public_requests_enabled boolean not null default true;

alter table clients add column if not exists sms_consent boolean not null default false;
alter table clients add column if not exists sms_opt_out_at timestamptz;

alter table jobs add column if not exists reminder_sent_at timestamptz;
alter table jobs add column if not exists review_requested_at timestamptz;

create index if not exists idx_jobs_reminder_pending
  on jobs (company_id, scheduled_date) where reminder_sent_at is null;
create index if not exists idx_jobs_review_pending
  on jobs (company_id, actual_end) where review_requested_at is null;

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  template text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_outbound_messages_company_created
  on outbound_messages (company_id, created_at desc);

alter table outbound_messages enable row level security;
drop policy if exists "Office can view company outbound messages" on outbound_messages;
create policy "Office can view company outbound messages"
  on outbound_messages for select
  using (
    company_id = auth_company_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'dispatcher'))
  );
