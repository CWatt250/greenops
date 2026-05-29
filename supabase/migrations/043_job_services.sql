-- Migration 043: job_services — the unified services data spine.
--
-- Background: the platform previously tracked a job's work in two disconnected
-- places — `job_line_items` (qty + price, no duration) and the job's
-- `estimated_duration_minutes` override. There was no single, editable list of
-- "what we're doing on this job" that carried BOTH a billable price AND an
-- on-site duration, and nothing flowed cleanly from proposal → job → invoice.
--
-- `job_services` is that spine. Each row is one service performed on a job,
-- snapshotted forward from the proposal it converted from (editable defaults,
-- never live-linked) and snapshotted onward to the invoice when one is
-- generated. The per-row `duration_minutes` (× quantity) feeds VROOM route
-- timing; the per-row `price` (× quantity) feeds the invoice line total. One
-- edit here flows to both route timing and billing by default, but each
-- downstream copy can be overridden independently.
--
-- Snapshot, not live-link: editing a master service never rewrites existing
-- job_services; editing a job never rewrites the proposal it came from; editing
-- an invoice never rewrites the job.

create table if not exists job_services (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  -- Nullable: one-off / custom services have no catalog row.
  service_id uuid references services(id) on delete set null,
  -- Snapshot of the service name at the time the row was created (or a freeform
  -- name for one-offs). Display falls back to the catalog service name when null.
  custom_name text,
  quantity numeric(10,2) not null default 1,
  -- On-site minutes for ONE unit of this service. VROOM uses duration × qty.
  duration_minutes integer,
  -- Per-unit billable price. Invoice line total = price × quantity.
  price numeric(10,2) not null default 0,
  notes text,
  -- Stable display order (carried from proposal sort_order on convert).
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_services_job on job_services(job_id);

alter table job_services enable row level security;

-- Company-scoped via the parent job. Single "for all" policy covers
-- select/insert/update/delete so inline-edit (incl. row removal) works.
create policy "Company members manage job_services"
  on job_services for all
  using (
    job_id in (
      select id from jobs
       where company_id in (select company_id from profiles where id = auth.uid())
    )
  )
  with check (
    job_id in (
      select id from jobs
       where company_id in (select company_id from profiles where id = auth.uid())
    )
  );
