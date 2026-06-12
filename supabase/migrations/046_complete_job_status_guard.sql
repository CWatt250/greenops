-- Migration 046: status guard on the complete_job RPC (from migration 035).
--
-- The 2026-06 audit found the RPC completed a job UNCONDITIONALLY: hitting
-- /complete/[id] again (direct URL — the UI hides the button) re-ran every
-- write, duplicating job_photos rows and activity_log entries and re-stamping
-- actual_end. Lock the job row and refuse when it is already complete.
--
-- Identical to 035 except:
--   * the company lookup locks the job row (FOR UPDATE) so two concurrent
--     submissions serialize instead of both passing the guard, and
--   * a clear exception when status = 'complete'.
--
-- Idempotent (create or replace). Apply to prod manually (same as 043-045).

create or replace function complete_job(
  p_job_id           uuid,
  p_signature_url    text,
  p_signed_by_name   text,
  p_photos           jsonb,    -- [{ storage_path, caption }, ...]
  p_clock_event_lat  numeric,
  p_clock_event_lng  numeric,
  p_user_id          uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_status     text;
  v_role       text;
  v_now        timestamptz := now();
begin
  -- Auth: caller must be the supplied user. RLS would normally guard,
  -- but security-definer bypasses RLS so we add an explicit check.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized: caller does not match p_user_id';
  end if;

  -- Lock the row: concurrent double-submits serialize here, so the second
  -- one sees status = 'complete' and is rejected below.
  select company_id, status into v_company_id, v_status
    from jobs where id = p_job_id for update;
  if v_company_id is null then
    raise exception 'Job not found';
  end if;
  if v_status = 'complete' then
    raise exception 'Job is already complete';
  end if;

  -- Confirm caller is a crew/owner/dispatcher in the job's company.
  select role into v_role from profiles
   where id = p_user_id and company_id = v_company_id;
  if v_role is null or v_role not in ('crew', 'owner', 'dispatcher') then
    raise exception 'Forbidden';
  end if;

  -- 1) Stamp the job row.
  update jobs set
    status         = 'complete',
    actual_end     = v_now,
    signature_url  = nullif(p_signature_url, ''),
    signed_by_name = nullif(p_signed_by_name, ''),
    signed_at      = case
                       when nullif(p_signature_url, '') is not null then v_now
                       else signed_at
                     end,
    updated_at     = v_now
   where id = p_job_id;

  -- 2) Auto clock-out if the user has an open clock-in for this job.
  if exists (
    select 1 from clock_events
     where job_id = p_job_id
       and profile_id = p_user_id
       and event_type = 'clock_in'
  ) and not exists (
    select 1 from clock_events ci
     where ci.job_id = p_job_id
       and ci.profile_id = p_user_id
       and ci.event_type = 'clock_out'
       and ci.created_at > (
         select max(created_at) from clock_events
          where job_id = p_job_id
            and profile_id = p_user_id
            and event_type = 'clock_in'
       )
  ) then
    insert into clock_events (
      company_id, job_id, profile_id, event_type, latitude, longitude
    ) values (
      v_company_id, p_job_id, p_user_id, 'clock_out',
      p_clock_event_lat, p_clock_event_lng
    );
  end if;

  -- 3) Insert photo rows. The storage upload itself happened client-side;
  -- we only persist the (storage_path, caption) tuples here.
  if p_photos is not null and jsonb_array_length(p_photos) > 0 then
    insert into job_photos (company_id, job_id, uploaded_by, storage_path, caption)
    select
      v_company_id,
      p_job_id,
      p_user_id,
      photo->>'storage_path',
      coalesce(photo->>'caption', 'After')
    from jsonb_array_elements(p_photos) as photo
    where photo->>'storage_path' is not null;
  end if;

  -- 4) Activity-log entry. Signature is on the job row now; metadata is
  -- just for the timeline UI.
  insert into activity_log (
    company_id, entity_type, entity_id, action, actor_id, metadata
  ) values (
    v_company_id, 'job', p_job_id,
    'status_changed_to_complete', p_user_id,
    jsonb_build_object(
      'photo_count', coalesce(jsonb_array_length(p_photos), 0),
      'signed', nullif(p_signature_url, '') is not null
    )
  );
end;
$$;

grant execute on function complete_job(uuid, text, text, jsonb, numeric, numeric, uuid) to authenticated;
