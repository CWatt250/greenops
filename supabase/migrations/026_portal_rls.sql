-- Portal-aware RLS. Existing policies on these tables filter via the
-- `profiles` table — but customers are in `portal_users`, not `profiles`,
-- so today /portal/jobs and /portal/invoices silently return zero rows.
--
-- These ADDITIVE policies don't replace the dispatcher-side policies; they
-- run alongside them so portal users can read their own client's data.

drop policy if exists "Portal users read own client jobs" on jobs;
drop policy if exists "Portal users read own client invoices" on invoices;
drop policy if exists "Portal users read own client job photos" on job_photos;
drop policy if exists "Portal users read own client" on clients;

create policy "Portal users read own client jobs"
  on jobs for select
  using (
    client_id in (
      select client_id from portal_users where id = auth.uid()
    )
  );

create policy "Portal users read own client invoices"
  on invoices for select
  using (
    client_id in (
      select client_id from portal_users where id = auth.uid()
    )
  );

-- Read photos that belong to a job that belongs to the portal user's client.
create policy "Portal users read own client job photos"
  on job_photos for select
  using (
    job_id in (
      select id from jobs where client_id in (
        select client_id from portal_users where id = auth.uid()
      )
    )
  );

create policy "Portal users read own client"
  on clients for select
  using (
    id in (
      select client_id from portal_users where id = auth.uid()
    )
  );
