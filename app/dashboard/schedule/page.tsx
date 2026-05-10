'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ScheduleGrid } from '@/components/schedule/schedule-grid';
import { ScheduleDayGrid } from '@/components/schedule/schedule-day-grid';
import { ScheduleMonthGrid } from '@/components/schedule/schedule-month-grid';
import { MobileDayView } from '@/components/schedule/mobile-day-view';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowScheduleWorks } from '@/components/help/how-page-works';
import { Button, buttonVariants } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Job, Crew } from '@/types';

type View = 'day' | 'week' | 'month';

function parseView(value: string | null): View {
  return value === 'day' || value === 'month' ? value : 'week';
}

function parseDate(value: string | null): Date {
  if (value) {
    const d = new Date(`${value}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getMondayOf(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfMonthGrid(d: Date): Date {
  // 6-week month grid → last cell is start-of-week-sunday(month start) + 41 days
  const monthStart = startOfMonth(d);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 41);
  return gridEnd;
}

function startOfMonthGrid(d: Date): Date {
  const monthStart = startOfMonth(d);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  return gridStart;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function SchedulePageInner() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = parseView(searchParams.get('view'));
  const anchor = useMemo(
    () => parseDate(searchParams.get('date')),
    [searchParams]
  );

  const [crews, setCrews] = useState<Crew[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [unassigned, setUnassigned] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute query window per view
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'day') {
      return { rangeStart: toDateStr(anchor), rangeEnd: toDateStr(anchor) };
    }
    if (view === 'month') {
      return {
        rangeStart: toDateStr(startOfMonthGrid(anchor)),
        rangeEnd: toDateStr(endOfMonthGrid(anchor)),
      };
    }
    // week
    const monday = getMondayOf(anchor);
    return {
      rangeStart: toDateStr(monday),
      rangeEnd: toDateStr(addDays(monday, 6)),
    };
  }, [view, anchor]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [crewsRes, jobsRes, unassignedRes] = await Promise.all([
      supabase.from('crews').select('*').eq('is_active', true).order('name'),
      supabase
        .from('jobs')
        .select('*, client:clients(name), crew:crews(id,name,color)')
        .gte('scheduled_date', rangeStart)
        .lte('scheduled_date', rangeEnd)
        .not('status', 'eq', 'cancelled'),
      supabase
        .from('jobs')
        .select('*, client:clients(name)')
        .eq('status', 'unscheduled')
        .is('scheduled_date', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setCrews((crewsRes.data ?? []) as Crew[]);
    setJobs((jobsRes.data ?? []) as Job[]);
    setUnassigned((unassignedRes.data ?? []) as Job[]);
    setLoading(false);
  }, [rangeStart, rangeEnd, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: re-fetch on any jobs change.
  useEffect(() => {
    const channel = supabase
      .channel('schedule-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        () => { loadData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData, supabase]);

  function navigate({ view: nextView, date: nextDate }: { view?: View; date?: Date }) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView) params.set('view', nextView);
    if (nextDate) params.set('date', toDateStr(nextDate));
    router.replace(`/dashboard/schedule?${params.toString()}`, { scroll: false });
  }

  function step(direction: 1 | -1) {
    if (view === 'day') {
      navigate({ date: addDays(anchor, direction) });
    } else if (view === 'week') {
      navigate({ date: addDays(anchor, direction * 7) });
    } else {
      const next = new Date(anchor);
      next.setMonth(next.getMonth() + direction);
      next.setDate(1);
      navigate({ date: next });
    }
  }

  function jumpToday() {
    navigate({ date: new Date() });
  }

  const headerLabel =
    view === 'day'
      ? formatDayLabel(anchor)
      : view === 'week'
        ? formatWeekLabel(getMondayOf(anchor))
        : formatMonthLabel(anchor);

  return (
    <div>
      <PageHeader title="Schedule" description="Drag jobs onto crew slots to schedule">
        <HowScheduleWorks />
        <Link
          href="/dashboard/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
      </PageHeader>

      <PageIntro
        id="schedule"
        title="Drag-and-drop scheduling"
        description="Drop jobs onto a crew lane to assign them. The Day / Week / Month toggle controls the time horizon."
        steps={[
          'Drag a job card from one cell to another to reassign or reschedule.',
          'Drop into the gray "Unassigned" lane to clear a crew without losing the date.',
          'Click any job to open it; click + New Job to add to today.',
        ]}
      />

      {/* Top bar: nav + view toggle + label — desktop only.
          Mobile uses the sticky header inside <MobileDayView /> below. */}
      <div className="hidden md:flex items-center gap-2 mb-5 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={jumpToday} className="gap-1.5">
          <CalendarDays className="h-4 w-4" />
          Today
        </Button>

        {/* View toggle (segmented) */}
        <div className="inline-flex rounded-lg border bg-background p-0.5">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => navigate({ view: v })}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors',
                view === v
                  ? 'bg-[var(--orange)] text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <span className="text-sm font-semibold ml-1">{headerLabel}</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-24">Loading schedule…</div>
      ) : (
        <>
          {/* Mobile: chronological day list, swipe-to-step (always day granularity). */}
          <MobileDayView
            date={anchor}
            crews={crews}
            jobs={jobs.filter((j) => j.scheduled_date === toDateStr(anchor))}
            onStepDay={(direction) => navigate({ view: 'day', date: addDays(anchor, direction) })}
            onJumpToday={jumpToday}
          />

          {/* Desktop: existing day/week/month grids. */}
          <div className="hidden md:block">
            {view === 'day' ? (
              <ScheduleDayGrid
                key={toDateStr(anchor)}
                date={anchor}
                crews={crews}
                initialJobs={jobs}
              />
            ) : view === 'month' ? (
              <ScheduleMonthGrid
                key={`${anchor.getFullYear()}-${anchor.getMonth()}`}
                monthAnchor={anchor}
                crews={crews}
                jobs={jobs}
                onDayClick={(date) => navigate({ view: 'day', date })}
              />
            ) : (
              <ScheduleGrid
                key={toDateStr(getMondayOf(anchor))}
                weekStart={getMondayOf(anchor)}
                crews={crews}
                initialJobs={jobs}
                unassignedInitial={unassigned}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground text-center py-24">Loading schedule…</div>}>
      <SchedulePageInner />
    </Suspense>
  );
}
