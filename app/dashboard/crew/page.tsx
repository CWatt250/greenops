'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { localDateStr } from '@/lib/dates';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowDispatchWorks } from '@/components/help/how-dispatch-works';
import { SendAppToWorker } from '@/components/dispatch/send-app-to-worker';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  MapPin, Clock, CheckCircle2, AlertCircle, Timer, Smartphone, WifiOff, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Job, Crew, ClockEvent, CrewLocation } from '@/types';
import type { MapStop } from '@/components/routes/route-map';

const RouteMap = dynamic(() => import('@/components/routes/route-map'), { ssr: false });

type JobWithClient = Job & {
  client: { name: string; service_address: string } | null;
};

type CrewWithJobs = Crew & {
  todayJobs: JobWithClient[];
  clockedInCount: number;
  lastLocation: CrewLocation | null;
};

type LiveStatus = 'connecting' | 'live' | 'polling' | 'offline';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} hr ago`;
}

const POLL_INTERVAL_MS = 30_000;
const STALE_GPS_MS = 10 * 60_000;

export default function DispatchPage() {
  const supabase = createClient();
  const [crewData, setCrewData] = useState<CrewWithJobs[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sendOpen, setSendOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');

  // Track if Realtime fired recently — used by the polling tick to decide
  // whether to demote status to "polling-only".
  const lastRtAtRef = useRef<number>(0);

  // Resolve current company once. Every dispatch query is then explicitly
  // scoped to it (defense-in-depth on top of RLS).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single();
      if (cancelled) return;
      const cid = (data as { company_id?: string } | null)?.company_id ?? null;
      setCompanyId(cid);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    const today = localDateStr(new Date());
    const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();

    const [crewsRes, jobsRes, clockRes, locsRes] = await Promise.all([
      supabase
        .from('crews')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('jobs')
        .select('*, client:clients(name,service_address)')
        .eq('company_id', companyId)
        .eq('scheduled_date', today)
        .not('status', 'eq', 'cancelled'),
      supabase
        .from('clock_events')
        .select('*')
        .eq('company_id', companyId)
        .eq('event_type', 'clock_in')
        .gte('created_at', `${today}T00:00:00`),
      supabase
        .from('crew_locations')
        .select('*')
        .eq('company_id', companyId)
        .gte('recorded_at', sinceIso)
        .order('recorded_at', { ascending: false }),
    ]);

    const crews = (crewsRes.data ?? []) as Crew[];
    const jobs = (jobsRes.data ?? []) as JobWithClient[];
    const clockIns = (clockRes.data ?? []) as ClockEvent[];
    const locations = (locsRes.data ?? []) as CrewLocation[];

    // Most recent location per crew (locations are ordered desc).
    const lastLocByCrew = new Map<string, CrewLocation>();
    for (const loc of locations) {
      if (loc.crew_id && !lastLocByCrew.has(loc.crew_id)) {
        lastLocByCrew.set(loc.crew_id, loc);
      }
    }

    const clockOutJobIds = new Set<string>();
    if (clockIns.length > 0) {
      const { data: clockOuts } = await supabase
        .from('clock_events')
        .select('job_id, profile_id')
        .eq('company_id', companyId)
        .eq('event_type', 'clock_out')
        .gte('created_at', `${today}T00:00:00`);
      (clockOuts ?? []).forEach((e: Pick<ClockEvent, 'job_id' | 'profile_id'>) =>
        clockOutJobIds.add(`${e.job_id}::${e.profile_id}`),
      );
    }

    const activeClockins = clockIns.filter(
      (e) => !clockOutJobIds.has(`${e.job_id}::${e.profile_id}`),
    );

    const built: CrewWithJobs[] = crews.map((crew) => {
      const todayJobs = jobs.filter((j) => j.crew_id === crew.id);
      const clockedInCount = activeClockins.filter((e) =>
        todayJobs.some((j) => j.id === e.job_id),
      ).length;
      return {
        ...crew,
        todayJobs,
        clockedInCount,
        lastLocation: lastLocByCrew.get(crew.id) ?? null,
      };
    });

    setCrewData(built);
    setLastRefresh(new Date());
    setLoading(false);
  }, [companyId]);

  // Initial fetch as soon as we know the company.
  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId, loadData]);

  // Realtime subscription on jobs / clock_events / crew_locations.
  useEffect(() => {
    if (!companyId) return;
    setLiveStatus('connecting');

    const channel = supabase
      .channel('dispatch-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        lastRtAtRef.current = Date.now();
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_events' }, () => {
        lastRtAtRef.current = Date.now();
        loadData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crew_locations' }, () => {
        lastRtAtRef.current = Date.now();
        loadData();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          lastRtAtRef.current = Date.now();
          setLiveStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLiveStatus('polling');
        } else if (status === 'CLOSED') {
          setLiveStatus('offline');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [companyId, supabase, loadData]);

  // Polling safety net — runs every 30s regardless of Realtime state. If
  // Realtime hasn't fired in the last 60s and we think we're "live",
  // demote to "polling" so the dispatcher knows the live channel might
  // be stale.
  useEffect(() => {
    if (!companyId) return;
    const id = window.setInterval(() => {
      loadData();
      const elapsed = Date.now() - lastRtAtRef.current;
      setLiveStatus((prev) => {
        if (prev === 'offline') return 'offline';
        if (elapsed > 60_000 && prev === 'live') return 'polling';
        return prev;
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [companyId, loadData]);

  // Reflect navigator online/offline so the indicator goes red when the
  // device itself loses network.
  useEffect(() => {
    function onOffline() { setLiveStatus('offline'); }
    function onOnline() { setLiveStatus('connecting'); loadData(); }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [loadData]);

  const totalJobs = crewData.reduce((s, c) => s + c.todayJobs.length, 0);
  const completedJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'complete').length, 0,
  );
  const inProgressJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'in_progress').length, 0,
  );
  const issueJobs = crewData.reduce(
    (s, c) => s + c.todayJobs.filter((j) => j.status === 'issue').length, 0,
  );

  // Build the live-truck pins for the map.
  const truckStops: MapStop[] = crewData
    .filter((c) => c.lastLocation && Number.isFinite(c.lastLocation.latitude) && Number.isFinite(c.lastLocation.longitude))
    .map((c) => ({
      id: c.id,
      lat: Number(c.lastLocation!.latitude),
      lng: Number(c.lastLocation!.longitude),
      order: 0,
      label: c.name,
      color: c.color,
      groupId: c.id,
    }));

  return (
    <div>
      <PageHeader
        title="Dispatch"
        description={
          <span className="inline-flex items-center gap-2">
            <LiveIndicator status={liveStatus} />
            Refreshed {lastRefresh.toLocaleTimeString()}
          </span>
        }
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
        description="Real-time view of who's clocked in, where each truck is, and what's in progress."
        steps={[
          'Each card shows a crew, their members on the clock, and today\u2019s jobs.',
          'Crew pins on the map update every 30 seconds while a job is in progress.',
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

      {/* Live truck map */}
      {truckStops.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <h2 className="text-sm font-semibold">Live truck locations</h2>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              GPS pings · last hour
            </span>
          </div>
          <div className="h-64">
            <RouteMap
              stops={truckStops}
              crewColor="var(--orange)"
              className="h-full"
            />
          </div>
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-16">Loading dispatch view…</p>
      )}

      {!loading && crewData.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">
          No active crews. <Link href="/dashboard/crews" className="underline">Manage crews</Link>.
        </p>
      )}

      <div className="space-y-4">
        {crewData.map((crew) => {
          const loc = crew.lastLocation;
          const stale = loc && Date.now() - new Date(loc.recorded_at).getTime() > STALE_GPS_MS;
          return (
            <div key={crew.id} className="rounded-xl border bg-card overflow-hidden">
              {/* Crew header */}
              <div
                className="flex items-center justify-between px-5 py-3 border-b gap-3"
                style={{ borderLeftWidth: 4, borderLeftColor: crew.color }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: crew.color }}
                  />
                  <h2 className="font-semibold text-sm truncate">{crew.name}</h2>
                  <span className="text-xs text-muted-foreground">
                    {crew.todayJobs.length} job{crew.todayJobs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {loc ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] font-medium',
                        stale ? 'text-amber-600' : 'text-muted-foreground',
                      )}
                      title={`Lat ${Number(loc.latitude).toFixed(4)}, Lng ${Number(loc.longitude).toFixed(4)}`}
                    >
                      <MapPin className="h-3 w-3" />
                      {stale ? 'No GPS for ' : 'Last seen '}
                      {relTime(loc.recorded_at)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" /> No GPS yet
                    </span>
                  )}
                  {crew.clockedInCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-green-100 text-green-700 border-green-200"
                    >
                      {crew.clockedInCount} clocked in
                    </Badge>
                  )}
                </div>
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
          );
        })}
      </div>
    </div>
  );
}

function LiveIndicator({ status }: { status: LiveStatus }) {
  const map = {
    connecting: { color: 'var(--muted-foreground)', label: 'Connecting…', Icon: Wifi, pulse: true },
    live:       { color: '#10B981',                 label: 'Live',          Icon: Wifi, pulse: true },
    polling:    { color: '#F59E0B',                 label: 'Polling',       Icon: Wifi, pulse: false },
    offline:    { color: '#EF4444',                 label: 'Offline',       Icon: WifiOff, pulse: false },
  } as const;
  const m = map[status];
  const Icon = m.Icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn('inline-block h-2 w-2 rounded-full', m.pulse && 'animate-pulse')}
        style={{ backgroundColor: m.color }}
      />
      <Icon className="h-3 w-3" style={{ color: m.color }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: m.color }}>
        {m.label}
      </span>
      <span aria-hidden>·</span>
    </span>
  );
}
