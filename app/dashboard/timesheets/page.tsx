'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import {
  buildTimesheets, buildPayrollCsv, weekStart, weekEnd,
  OT_WEEKLY_THRESHOLD_HOURS, type TimesheetEvent, type MemberTimesheet,
} from '@/lib/timesheets';
import {
  Clock, ChevronLeft, ChevronRight, Download, Loader2, MapPinOff, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EventRow extends TimesheetEvent {
  latitude: number | null;
  longitude: number | null;
  profile?: { full_name: string | null } | null;
  job?: { title: string; client?: { name: string } | null } | null;
}

const r2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US');

export default function TimesheetsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [events, setEvents] = useState<EventRow[]>([]);
  const [flaggedQueue, setFlaggedQueue] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const end = useMemo(() => weekEnd(start), [start]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single();
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      // profiles is referenced twice from clock_events (profile_id +
      // reviewed_by, migration 055) — the !profile_id hint disambiguates
      // the embed, otherwise PostgREST 400s.
      const cols =
        'id, job_id, profile_id, event_type, created_at, latitude, longitude, ' +
        'distance_from_site_m, flagged, flag_reason, reviewed_at, ' +
        'profile:profiles!profile_id(full_name), job:jobs(title, client:clients(name))';
      const [weekRes, flaggedRes] = await Promise.all([
        supabase
          .from('clock_events')
          .select(cols)
          .eq('company_id', companyId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at'),
        supabase
          .from('clock_events')
          .select(cols)
          .eq('company_id', companyId)
          .eq('flagged', true)
          .is('reviewed_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setEvents((weekRes.data ?? []) as unknown as EventRow[]);
      setFlaggedQueue((flaggedRes.data ?? []) as unknown as EventRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, start, end]);

  const sheets = useMemo(() => buildTimesheets(events), [events]);
  const names = useMemo(() => {
    const m = new Map<string, { full_name: string | null }>();
    for (const e of events) {
      if (!m.has(e.profile_id)) m.set(e.profile_id, { full_name: e.profile?.full_name ?? null });
    }
    return m;
  }, [events]);
  const jobLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) {
      if (e.job) m.set(e.job_id, e.job.client?.name ?? e.job.title);
    }
    return m;
  }, [events]);

  const sortedSheets = useMemo(
    () => [...sheets.values()].sort((a, b) =>
      (names.get(a.profile_id)?.full_name ?? '').localeCompare(names.get(b.profile_id)?.full_name ?? '')),
    [sheets, names],
  );

  const rangeLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(end.getTime() - 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  function shiftWeek(delta: number) {
    setStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }

  function exportCsv() {
    const csv = buildPayrollCsv(sheets, names, start, end);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-hours-${start.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function approveEvent(eventId: string) {
    if (!userId) return;
    setApproving(eventId);
    const { error } = await supabase
      .from('clock_events')
      .update({ reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq('id', eventId);
    setApproving(null);
    if (error) { toast.error(error.message); return; }
    setFlaggedQueue((prev) => prev.filter((e) => e.id !== eventId));
    toast.success('Punch approved.');
  }

  return (
    <div>
      <PageHeader title="Timesheets" description="Hours, overtime, and flagged punches by pay week">
        <Button variant="outline" onClick={exportCsv} disabled={sheets.size === 0} className="gap-1.5">
          <Download className="h-4 w-4" /> Payroll CSV
        </Button>
      </PageHeader>

      <PageIntro
        id="timesheets"
        title="From clock events to payroll"
        description="Every crew clock-in/out rolls up here per pay week. Punches outside the job-site radius arrive flagged with the worker's reason — approve them here so payroll is clean."
        steps={[
          'Pick the week; hours split regular vs overtime past 40h.',
          'Review flagged punches — distance and reason shown on each.',
          'Export the payroll CSV and import it into Gusto/ADP.',
        ]}
      />

      {/* Flagged review queue */}
      {flaggedQueue.length > 0 && (
        <div className="mb-5 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
            <MapPinOff className="h-4 w-4" />
            {flaggedQueue.length} punch{flaggedQueue.length === 1 ? '' : 'es'} outside the site radius
          </p>
          <ul className="space-y-2">
            {flaggedQueue.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2">
                <div className="text-xs text-amber-900">
                  <p className="font-semibold">
                    {e.profile?.full_name ?? 'Unknown'} — {e.job?.client?.name ?? e.job?.title ?? 'job'}
                  </p>
                  <p className="mt-0.5">
                    {new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {e.distance_from_site_m !== null && e.distance_from_site_m !== undefined && (
                      <> · {Number(e.distance_from_site_m) >= 1000
                        ? `${(Number(e.distance_from_site_m) / 1609.34).toFixed(1)} mi`
                        : `${Math.round(Number(e.distance_from_site_m))} m`} from site</>
                    )}
                  </p>
                  {e.flag_reason && <p className="italic mt-0.5">&ldquo;{e.flag_reason}&rdquo;</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => approveEvent(e.id)}
                  disabled={approving === e.id}
                  className="gap-1 shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  {approving === e.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Week nav */}
      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)} className="gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <p className="text-sm font-semibold">{rangeLabel}</p>
        <Button variant="outline" size="sm" onClick={() => shiftWeek(1)} className="gap-1">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sortedSheets.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No hours this week"
          description="Clock-ins from the crew app roll up here automatically."
        />
      ) : (
        <ul className="space-y-3">
          {sortedSheets.map((s: MemberTimesheet) => (
            <li key={s.profile_id} className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setExpanded(expanded === s.profile_id ? null : s.profile_id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {names.get(s.profile_id)?.full_name ?? 'Unknown member'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.intervals.length} shift{s.intervals.length === 1 ? '' : 's'}
                    {s.openIntervals > 0 && (
                      <span className="text-amber-600 font-medium">
                        {' '}· {s.openIntervals} open punch{s.openIntervals === 1 ? '' : 'es'} (not counted)
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{r2(s.totalHours)} h</p>
                  <p className={cn('text-xs tabular-nums', s.overtimeHours > 0 ? 'text-orange-600 font-semibold' : 'text-muted-foreground')}>
                    {s.overtimeHours > 0
                      ? `${r2(s.regularHours)} reg + ${r2(s.overtimeHours)} OT`
                      : 'no OT'}
                  </p>
                </div>
              </button>
              {expanded === s.profile_id && (
                <div className="border-t px-4 py-2.5">
                  <ul className="space-y-1 text-xs">
                    {s.intervals.map((iv, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 tabular-nums">
                        <span className="truncate text-muted-foreground">
                          {jobLabel.get(iv.job_id) ?? 'Job'}
                        </span>
                        <span className="shrink-0">
                          {new Date(iv.clocked_in_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                          {' → '}
                          {new Date(iv.clocked_out_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          <span className="font-semibold ml-2">{r2(iv.hours)} h</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.overtimeHours > 0 && (
                    <p className="mt-2 text-[11px] text-orange-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Over {OT_WEEKLY_THRESHOLD_HOURS}h this week — overtime applies.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
