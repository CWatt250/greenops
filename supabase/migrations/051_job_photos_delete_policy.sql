-- 051: allow owner/dispatcher to delete job_photos rows.
--
-- The job-photos STORAGE bucket already lets owner/dispatcher delete objects
-- (migration 024), but the job_photos TABLE only had view + insert policies, so
-- deleting the row was blocked by RLS — leaving no way to remove a photo from a
-- job. Add a company-scoped delete policy for owner/dispatcher, mirroring the
-- storage rule. Crew delete stays disallowed (matches storage).
--
-- Idempotent. Apply to prod (same as 046-050).

drop policy if exists "Owner/dispatcher delete job_photos" on job_photos;
create policy "Owner/dispatcher delete job_photos"
  on job_photos for delete
  using (
    company_id in (
      select company_id from profiles
      where id = auth.uid() and role in ('owner', 'dispatcher')
    )
  );
