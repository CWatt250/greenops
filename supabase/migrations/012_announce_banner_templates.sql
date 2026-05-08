-- Manual broadcast notifications + portal banner + note templates.
-- Apply via Supabase SQL editor before using the new dashboard features.

-- 1) Portal banner — single configurable banner per company that shows
--    at the top of the customer portal. Stored on companies.
alter table companies add column if not exists portal_banner_message text;
alter table companies add column if not exists portal_banner_cta_label text;
alter table companies add column if not exists portal_banner_cta_url text;
alter table companies add column if not exists portal_banner_expires_at timestamptz;
alter table companies add column if not exists portal_banner_enabled boolean default false;

-- 2) Note templates — reusable text snippets for job notes.
create table if not exists note_templates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  label text not null,
  body text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table note_templates enable row level security;

create policy "Company members can manage note templates"
  on note_templates for all
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- 3) portal_notifications.type needs a 'broadcast' value so the dashboard
--    Announce flow can fan out custom messages without misclassifying them.
alter table portal_notifications drop constraint if exists portal_notifications_type_check;
alter table portal_notifications add constraint portal_notifications_type_check
  check (type in (
    'job_scheduled','crew_enroute','job_complete',
    'invoice_ready','request_update','complaint_update','message',
    'broadcast'
  ));
