-- Web push (roadmap F2.2): one row per device a user enabled alerts on.
-- Idempotent. Apply with `supabase db push`.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_push_subscriptions_profile on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on push_subscriptions;
create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
