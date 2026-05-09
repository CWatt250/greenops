'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowDispatchWorks } from '@/components/help/how-dispatch-works';
import { SendAppToWorker } from '@/components/dispatch/send-app-to-worker';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { MapPin, Clock, CheckCircle2, AlertCircle, Timer, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Job, Crew, ClockEvent } from '@/types';

type JobWithClient = Job & {
  client: { name: string; service_address: string } | null;
};

type CrewWithJobs = Crew & {
  todayJobs: JobWithClient[];
  clockedInCount: number;
};

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function DispatchPage() {
  const supabase = createClient();
  const [crewData, setCrewData] = useState<CrewWithJobs[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sendOpen, setSendOpen] = useState(false);

  const loadData = useCallback(async () => {
    const today = toDateStr(new Date());

    const [crewsRes, jobsRes, clockRes] = await Promise.all([
      supabase.from('crews').select('*').eq('is_active', true).order('name'),
      supabase
        .from('jobs')
        .select('*, client:clients(name,service_address)')
        .eq('scheduled_date', today)
        .not('status', 'eq', 'cancelled'),
      supabase
        .from('clock_events')
        .select('*')
        .eq('event_type', 'clock_in')
        .gte('created_at', `${today}T00:00:00`),
    ]);

    const crews = (crewsRes.data ?? []) as Crew[];
    const jobs = (jobsRes.data ?? []) as JobWithClient[];
    const clockIns = (clockRes.data ?? []) as ClockEvent[];

    // Get clock-out job IDs to determine who is still clocked in
    const clockOutJobIds = new Set<string>();
    if (clockIns.length > 0) {
      const { data: clockOuts } = await supabase
        .from('clock_events')
        .select('job_id, profile_id')
        .eq('event_type', 'clock_out')
        .gte('created_at', `${today}T00:00:00`);
      (clockOuts ?? []).forEach((e: Pick<ClockEvent, 'job_id' | 'profile_id'>) =>
        clockOutJobIds.add(`${e.job_id}::${e.profile_id}`)
      );
    }

    const activeClockins = clockIns.filter(
      (e) => !clockOutJobIds.has(`${e.job_id}::${e.profile_id}`)
    );

    const built: CrewWithJobs[] = crews.map((crew) => {
      const todayJobs = jobs.filter((j) => j.crew_id === crew.id);
      const clockedInCount = activeClockins.filter((e) =>
        todayJobs.some((j) => j.id === e.job_id)
      ).length;
      return { ...crew, todayJobs, clockedInCount };
    });

    setCrewData(built);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time on jobs + clock_events
  useEffect(() => {
    const channel = supabase
      .channel('dispatch-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_events' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const totalJobs = crewData.reduce((s, c) => s + c.todayJobs.length, 0);
  const completedJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'complete').length, 0
  );
  const inProgressJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'in_progress').length, 0
  );
  const issueJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'issue').length, 0
  );

  return (
    <div>
      <PageHeader
        title="Dispatch"
        description={`Live crew status · refreshed ${lastRefresh.toLocaleTimeString()}`}
      >
        <HowDispatchWorks />
        <Button
          onClick={() => setSendOpen(true)}
          className="gap-1.5 text-white"
          style={{ backgroundColor: 'var(--orange)' }}
        >
          <Smartphone className="h-4 w-4" />
          Send App to Worker
        </Button>
      </PageHeader>

      <SendAppToWorker open={sendOpen} onOpenChange={setSendOpen} />

      <PageIntro
        id="dispatch"
        title="Live crew status"
        description="Real-time view of who's clocked in, what's in progress, and which jobs still need attention."
        steps={[
          'Each card shows a crew, their members on the clock, and today\'s jobs.',
          'Job status badges update automatically as crews tap Start / Complete.',
          'Click any job to open the detail page, reassign, or change status.',
        ]}
      />

      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">{totalJobs} jobs today</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
          <Timer className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">{inProgressJobs} in progress</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">{completedJobs} complete</span>
        </div>
        {issueJobs > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-700">{issueJobs} issue{issueJobs > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-16">Loading dispatch view…</p>
      )}

      {!loading && crewData.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">
          No active crews. <Link href="/dashboard/crews" className="underline">Manage crews</Link>.
        </p>
      )}

      <div className="space-y-4">
        {crewData.map((crew) => (
          <div key={crew.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Crew header */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderLeftWidth: 4, borderLeftColor: crew.color }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: crew.color }}
                />
                <h2 className="font-semibold text-sm">{crew.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {crew.todayJobs.length} job{crew.todayJobs.length !== 1 ? 's' : ''}
                </span>
              </div>
              {crew.clockedInCount > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-green-100 text-green-700 border-green-200"
                >
                  {crew.clockedInCount} clocked in
                </Badge>
              )}
            </div>

            {/* Jobs */}
            {crew.todayJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-5 py-4">
                No jobs assigned today
              </p>
            ) : (
              <div className="divide-y">
                {crew.todayJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/dashboard/jobs/${job.id}`}
                    className="flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      {job.client && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground truncate">
                            {job.client.name} · {job.client.service_address}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {job.scheduled_start && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {(job.scheduled_start as string).slice(0, 5)}
                        </span>
                      )}
                      <StatusBadge status={job.status} type="job" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
