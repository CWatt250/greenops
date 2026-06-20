-- 050: Make the job photo + signature buckets PRIVATE (audit #4, phase 3).
--
-- These buckets were `public: true` with an "anyone can read" policy, so any
-- photo/signature was viewable by anyone who had (or guessed/leaked) its URL.
-- All reads now flow through the /api/files signed-URL proxy, which authorizes
-- the caller (staff by company, portal customers by job ownership) and signs
-- with the service role — so public access and the open read policies are no
-- longer needed. Uploads keep their existing authenticated, company-scoped
-- INSERT policies, and owner/dispatcher DELETE policies are untouched.
--
-- ⚠️ Apply only AFTER the phase 1 + 2 code (signed-URL proxy + converted
-- display surfaces) is live, or images will 404 until it deploys.

update storage.buckets set public = false where id in ('job-photos', 'job-signatures');

drop policy if exists "Anyone can read job photos" on storage.objects;
drop policy if exists "Anyone can read job signatures" on storage.objects;
