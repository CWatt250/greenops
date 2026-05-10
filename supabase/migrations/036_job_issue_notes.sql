-- Issue flagging — capture detail
--
-- Today the crew "Flag issue" button just flips jobs.status='issue' with
-- no description. The dispatcher gets a red badge but no context. Add a
-- text column for the issue notes; photos can ride along on job_photos
-- with caption='Issue'.

alter table jobs add column if not exists issue_notes text;
alter table jobs add column if not exists issue_flagged_at timestamptz;
alter table jobs add column if not exists issue_flagged_by uuid references profiles(id) on delete set null;
