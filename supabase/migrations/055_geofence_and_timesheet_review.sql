-- 055: geofenced clock-in + timesheet review fields.
--
-- Clock-ins have always captured GPS (003) but nothing compared it to the
-- job site. Now the crew app computes the distance to the client's stored
-- coordinates; out-of-range punches require a confirm + reason and land
-- flagged for dispatcher review on /dashboard/timesheets. Never a hard
-- block — rural GPS accuracy is a real thing.
--
-- Idempotent. Apply with `supabase db push`.

alter table companies
  add column if not exists geofence_radius_m integer not null default 150;

comment on column companies.geofence_radius_m is
  'Clock-in distance from the job site (meters) beyond which the punch is flagged for review.';

alter table clock_events
  add column if not exists distance_from_site_m numeric(8,1),
  add column if not exists flagged boolean not null default false,
  add column if not exists flag_reason text,
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz;

comment on column clock_events.distance_from_site_m is
  'Haversine meters between the punch GPS and the client''s stored coordinates. Null = one side had no coords.';

-- Dispatcher/owner review (003 only had select + insert policies).
drop policy if exists "Office reviews clock_events" on clock_events;
create policy "Office reviews clock_events"
  on clock_events for update
  using (
    company_id in (
      select company_id from profiles
      where id = auth.uid() and role in ('owner', 'dispatcher')
    )
  );

create index if not exists idx_clock_events_flagged
  on clock_events(company_id, flagged) where flagged;
create index if not exists idx_clock_events_created
  on clock_events(company_id, created_at);
