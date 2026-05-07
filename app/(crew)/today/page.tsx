export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import { MapPin, Clock, ChevronRight, CalendarDays } from 'lucide-react';
import type { Job } from '@/types';

type JobWithClient = Job & {
  client: { name: string; service_address: string } | null;
};

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) {
    return (
      <div className="text-sm text-muted-foreground text-center py-16">
        No company linked to your account. Contact your dispatcher.
      </div>
    );
  }

  const { data: crewMemberRaw } = await supabase
    .from('crew_members')
    .select('crew_id, crew:crews(name,color)')
    .eq('profile_id', user.id)
    .maybeSingle();

  const crewMember = crewMemberRaw as
    | { crew_id: string; crew: { name: string; color: string } | null }
    | null;

  const today = new Date().toISOString().split('T')[0];

  let jobsQuery = supabase
    .from('jobs')
    .select('*, client:clients(name,service_address)')
    .eq('company_id', profile.company_id)
    .eq('scheduled_date', today)
    .not('status', 'in', '("cancelled")')
    .order('scheduled_start');

  if (crewMember?.crew_id) {
    jobsQuery = jobsQuery.eq('crew_id', crewMember.crew_id);
  }

  const { data: jobs } = await jobsQuery;
  const todayJobs = (jobs ?? []) as JobWithClient[];

  const inProgress = todayJobs.filter((j) => j.status === 'in_progress');
  const remaining = todayJobs.filter(
    (j) => j.status === 'scheduled' || j.status === 'unscheduled'
  );
  const done = todayJobs.filter((j) => j.status === 'complete');

  function JobCard({ job }: { job: JobWithClient }) {
    return (
      <Link
        href={`/job/${job.id}`}
        className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4 active:opacity-70 transition-opacity"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{job.title}</p>
          {job.client && (
            <>
              <div className="flex items-center gap-1.5 mt-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{job.client.name}</p>
              </div>
              <p className="text-xs text-muted-foreground pl-5 truncate">
                {job.client.service_address}
              </p>
            </>
          )}
          {job.scheduled_start && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                {(job.scheduled_start as string).slice(0, 5)}
                {job.scheduled_end &&
                  ` – ${(job.scheduled_end as string).slice(0, 5)}`}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={job.status} type="job" />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Date header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">Today's Jobs</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(today)}</p>
        </div>
      </div>

      {/* Crew badge */}
      {crewMember?.crew && (
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: crewMember.crew?.color ?? '#3D6B2C' }}
          />
          <span className="text-xs font-medium text-muted-foreground">
            {crewMember.crew?.name}
          </span>
        </div>
      )}

      {/* No jobs at all */}
      {todayJobs.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
          <p className="text-sm text-muted-foreground">No jobs scheduled for today.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Check back later or contact your dispatcher.
          </p>
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
            In Progress
          </p>
          <div className="space-y-2.5">
            {inProgress.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      {/* Remaining */}
      {remaining.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Up Next ({remaining.length})
          </p>
          <div className="space-y-2.5">
            {remaining.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-2">
            Completed ({done.length})
          </p>
          <div className="space-y-2.5 opacity-60">
            {done.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}
    </div>
  );
}
