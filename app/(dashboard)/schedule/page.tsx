'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ScheduleGrid } from '@/components/schedule/schedule-grid';
import { PageHeader } from '@/components/shared/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import type { Job, Crew } from '@/types';

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Mon=1, so if Sun (0) go back 6
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = sunday.getFullYear();
  return `${fmt(monday)} – ${fmt(sunday)}, ${year}`;
}

export default function SchedulePage() {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [crews, setCrews] = useState<Crew[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [unassigned, setUnassigned] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    const weekEnd = addDays(weekStart, 6);
    const startStr = weekStart.toISOString().split('T')[0];
    const endStr = weekEnd.toISOString().split('T')[0];

    const [crewsRes, weekJobsRes, unassignedRes] = await Promise.all([
      supabase
        .from('crews')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('jobs')
        .select('*, client:clients(name), crew:crews(name,color)')
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr)
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
    setJobs((weekJobsRes.data ?? []) as Job[]);
    setUnassigned((unassignedRes.data ?? []) as Job[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Supabase Realtime — refresh grid when jobs change
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
  }, [weekStart]);

  function prevWeek() { setWeekStart((w) => addDays(w, -7)); }
  function nextWeek() { setWeekStart((w) => addDays(w, 7)); }
  function goToday() { setWeekStart(getMondayOf(new Date())); }

  return (
    <div>
      <PageHeader title="Schedule" description="Drag jobs onto crew slots to schedule">
        <Link
          href="/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
      </PageHeader>

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-5">
        <Button variant="outline" size="icon" onClick={prevWeek} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={nextWeek} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday} className="gap-1.5">
          <CalendarDays className="h-4 w-4" />
          Today
        </Button>
        <span className="text-sm font-semibold ml-1">{formatWeekRange(weekStart)}</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-24">Loading schedule…</div>
      ) : (
        <ScheduleGrid
          key={weekStart.toISOString()}
          weekStart={weekStart}
          crews={crews}
          initialJobs={jobs}
          unassignedInitial={unassigned}
        />
      )}
    </div>
  );
}
