-- In-app error reporting (no third-party monitoring account needed).
-- Error boundaries POST to /api/errors, which inserts here with the service
-- role after authenticating the reporter, then pings the owners' bell via
-- notifyStaff (deduped per message per hour in the route).
--
-- Idempotent. Apply with `supabase db push`.

create table if not exists client_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  path text,
  message text not null,
  digest text,
  stack text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_errors_company_created
  on client_errors (company_id, created_at desc);

alter table client_errors enable row level security;

-- Owners and dispatchers can review their company's errors; inserts happen
-- server-side only (service role), so no insert policy for end users.
drop policy if exists "Office can view company client errors" on client_errors;
create policy "Office can view company client errors"
  on client_errors for select
  using (
    company_id = auth_company_id()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('owner', 'dispatcher')
    )
  );
