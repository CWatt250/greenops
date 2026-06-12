'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types';

export interface TodaysRunJob {
  id: string;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  client: { id: string; name: string; service_address: string } | null;
  crew: { id: string; name: string; color: string } | null;
}

interface Props {
  /** Server-rendered seed so the first paint isn't empty. */
  initialJobs: TodaysRunJob[];
  /** Required so the client-side fetch can scope queries (defense-in-depth
   *  on top of RLS). */
  companyId: string | null;
  /** Cap rows displayed. Defaults to 8. */
  limit?: number;
}

type LiveStatus = 'connecting' | 'live' | 'polling' | 'offline';
const POLL_INTERVAL_MS = 30_000;

function fmtTime(t: string | null) {
  if (!t) return '—';
  return t.slice(0, 5);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TodaysRunTable({ initialJobs, companyId, limit = 8 }: Props) {
  const supabase = createClient();
  const [jobs, setJobs] = useState<TodaysRunJob[]>(initialJobs);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Start null and stamp after mount: a render-time `new Date()` puts the
  // SERVER's clock in the HTML and the client's in hydration — a guaranteed
  // mismatch whenever the two renders straddle a second boundary (this was
  // the app's one recurring dev hydration error).
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const lastRtAtRef = useRef<number>(0);

  useEffect(() => {
    setUpdatedAt(new Date());
  }, []);

  const loadJobs = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('jobs')
      .select(
        'id, title, status, scheduled_start, scheduled_end, ' +
        'client:clients(id,name,service_address), ' +
        'crew:crews(id,name,color)',
      )
      .eq('company_id', companyId)
      .eq('scheduled_date', todayStr())
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start', { nullsFirst: false });
    if (data) {
      setJobs((data as unknown) as TodaysRunJob[]);
      setUpdatedAt(new Date());
    }
  }, [companyId, supabase]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;
    setStatus('connecting');
    const channel = supabase
      .channel('todays-run-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        lastRtAtRef.current = Date.now();
        loadJobs();
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          lastRtAtRef.current = Date.now();
          setStatus('live');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          setStatus('polling');
        } else if (s === 'CLOSED') {
          setStatus('offline');
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [companyId, supabase, loadJobs]);

  // Polling safety net
  useEffect(() => {
    if (!companyId) return;
    const id = window.setInterval(() => {
      loadJobs();
      const elapsed = Date.now() - lastRtAtRef.current;
      setStatus((prev) => {
        if (prev === 'offline') return 'offline';
        if (elapsed > 60_000 && prev === 'live') return 'polling';
        return prev;
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [companyId, loadJobs]);

  // Online/offline awareness
  useEffect(() => {
    function onOffline() { setStatus('offline'); }
    function onOnline() { setStatus('connecting'); loadJobs(); }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [loadJobs]);

  const visible = jobs.slice(0, limit);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b">
        <div>
          <h2
            className="text-base uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
          >
            Today&apos;s run
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live status across all crews
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LiveIndicator status={status} />
          <span className="text-[10px] text-muted-foreground tabular-nums">
            · {updatedAt ? updatedAt.toLocaleTimeString() : '—'}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12 px-5">
          Nothing scheduled today. Click <strong>+ New Job</strong> to add one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-5 py-2.5">Job</th>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Crew</th>
                <th className="px-3 py-2.5">Window</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((job) => (
                <tr key={job.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {job.client ? (
                      <>
                        <Link
                          href={`/dashboard/clients/${job.client.id}`}
                          className="hover:underline"
                        >
                          {job.client.name}
                        </Link>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {job.client.service_address?.split(',')[0]}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {job.crew ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: job.crew.color }}
                          title={`Crew color: ${job.crew.color}`}
                        />
                        <span>{job.crew.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground tabular-nums">
                    {fmtTime(job.scheduled_start)}–{fmtTime(job.scheduled_end)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={job.status} type="job" />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <Link href={`/dashboard/jobs/${job.id}`} aria-label="Open job">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    <span className="inline-flex items-center gap-1">
      <span
        className={cn('inline-block h-2 w-2 rounded-full', m.pulse && 'animate-pulse')}
        style={{ backgroundColor: m.color }}
      />
      <Icon className="h-3 w-3" style={{ color: m.color }} />
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: m.color }}>
        {m.label}
      </span>
    </span>
  );
}
