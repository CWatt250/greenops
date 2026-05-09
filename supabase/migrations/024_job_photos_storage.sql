-- Public storage bucket for crew completion photos. The job_photos table
-- (created in migration 003) already exists; this just creates the bucket
-- + RLS so authenticated crew users can upload directly from the
-- /complete/[id] flow and the admin job detail page can render them.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated can upload job photos" on storage.objects;
drop policy if exists "Anyone can read job photos" on storage.objects;
drop policy if exists "Owner/dispatcher can delete job photos" on storage.objects;

create policy "Authenticated can upload job photos"
  on storage.objects for insert
  with check (
    bucket_id = 'job-photos'
    and auth.role() = 'authenticated'
  );

create policy "Anyone can read job photos"
  on storage.objects for select
  using (bucket_id = 'job-photos');

-- Object key convention: <company_id>/<job_id>/<filename>. Owners and
-- dispatchers can delete photos in their own company.
create policy "Owner/dispatcher can delete job photos"
  on storage.objects for delete
  using (
    bucket_id = 'job-photos'
    and auth.uid() in (
      select id from profiles
      where role in ('owner', 'dispatcher')
        and company_id::text = split_part(name, '/', 1)
    )
  );
