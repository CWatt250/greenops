-- Customer signature on the job row itself. Previously the signature data
-- URL was buried inside activity_log.metadata which is hard to query and
-- hard to display. Adding signature_url + signed_by_name + signed_at lets
-- the admin job detail page render it inline next to the photo gallery.

alter table jobs add column if not exists signature_url text;
alter table jobs add column if not exists signed_by_name text;
alter table jobs add column if not exists signed_at timestamptz;

-- Public storage bucket for the signature PNGs.
insert into storage.buckets (id, name, public)
values ('job-signatures', 'job-signatures', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated can upload job signatures" on storage.objects;
drop policy if exists "Anyone can read job signatures" on storage.objects;

create policy "Authenticated can upload job signatures"
  on storage.objects for insert
  with check (
    bucket_id = 'job-signatures'
    and auth.role() = 'authenticated'
  );

create policy "Anyone can read job signatures"
  on storage.objects for select
  using (bucket_id = 'job-signatures');
