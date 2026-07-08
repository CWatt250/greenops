-- 057: staff can actually deliver portal notifications.
--
-- portal_notifications (007) shipped with SELECT + UPDATE policies for the
-- customer and NO insert policy at all — so every office-side insert
-- (request/complaint status updates from the portal-admin queues, announce
-- broadcasts) has been silently rejected by RLS since the portal launched.
-- Customers never received a single in-app notification. Found by the
-- 2026-07-08 portal audit's round-trip test.
--
-- portal_users was also customer-self-only, which (a) breaks the insert
-- policy's membership subquery and (b) hid portal accounts from the office
-- that manages them — staff get company-scoped SELECT.
--
-- Idempotent. Apply with `supabase db push`.

drop policy if exists "Staff view company portal users" on portal_users;
create policy "Staff view company portal users"
  on portal_users for select
  using (
    company_id in (
      select company_id from profiles
      where id = auth.uid() and role in ('owner', 'dispatcher')
    )
  );

drop policy if exists "Staff can notify company portal users" on portal_notifications;
create policy "Staff can notify company portal users"
  on portal_notifications for insert
  with check (
    portal_user_id in (
      select pu.id from portal_users pu
      where pu.company_id in (
        select company_id from profiles
        where id = auth.uid() and role in ('owner', 'dispatcher')
      )
    )
  );
