'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localDateStr } from '@/lib/dates';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createClient } from '@/lib/supabase/client';
import { DraggableJobCard } from './draggable-job-card';
import { cn } from '@/lib/utils';
import type { Job, Crew } from '@/types';

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const SLOT_MIN = 30;
const PX_PER_MIN = 1; // 60 minutes = 60px
const TOTAL_MIN = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const COLUMN_HEIGHT = TOTAL_MIN * PX_PER_MIN;

const UNASSIGNED_LANE_ID = '__unassigned__';
const UNASSIGNED_COLOR = '#94A3B8';

interface ScheduleDayGridProps {
  date: Date;
  crews: Crew[];
  initialJobs: Job[];
}

function isSameDate(a: Date, b: Date): boolean {
  return localDateStr(a) === localDateStr(b);
}

function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function formatHourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 || 12;
  return `${display} ${suffix}`;
}

function CrewColumn({
  laneId,
  laneName,
  laneColor,
  jobs,
  date,
}: {
  laneId: string; // either a crew uuid or UNASSIGNED_LANE_ID
  laneName: string;
  laneColor: string;
  jobs: Job[];
  date: Date;
}) {
  const dropId = `day-col::${laneId}::${localDateStr(date)}`;
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  return (
    <div className="flex-1 min-w-0">
      <div
        className="flex items-center gap-2 px-2 py-1.5 mb-1 border-b"
        style={{ borderBottomColor: laneColor }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: laneColor }}
        />
        <span className="text-xs font-semibold truncate">{laneName}</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {jobs.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'relative rounded-lg border transition-colors',
          isOver ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted/10'
        )}
        style={{ height: COLUMN_HEIGHT }}
      >
        {jobs.map((job) => {
          const startMin = parseHHMM(job.scheduled_start as string | null);
          if (startMin === null) return null;
          const top = Math.max(0, startMin - DAY_START_HOUR * 60) * PX_PER_MIN;

          // Duration: prefer scheduled_end - start, fallback to 60 min.
          const endMin = parseHHMM(job.scheduled_end as string | null);
          const duration = endMin && endMin > startMin ? endMin - startMin : 60;
          const height = Math.max(28, duration * PX_PER_MIN - 4);

          return (
            <div
              key={job.id}
              className="absolute left-1 right-1"
              style={{ top, height }}
            >
              <DraggableJobCard job={job} compact />
            </div>
          );
        })}
        {jobs.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/60 italic">
            Drop a job here
          </p>
        )}
      </div>
    </div>
  );
}

export function ScheduleDayGrid({ date, crews, initialJobs }: ScheduleDayGridProps) {
  const supabase = createClient();
  // Bucket jobs by crew_id, with UNASSIGNED_LANE_ID for null-crew jobs.
  function bucketize(jobs: Job[], cs: Crew[]): Map<string, Job[]> {
    const map = new Map<string, Job[]>();
    map.set(UNASSIGNED_LANE_ID, []);
    for (const c of cs) map.set(c.id, []);
    for (const j of jobs) {
      const k = j.crew_id ? j.crew_id : UNASSIGNED_LANE_ID;
      const list = map.get(k) ?? [];
      list.push(j);
      map.set(k, list);
    }
    return map;
  }

  const [jobsByCrew, setJobsByCrew] = useState<Map<string, Job[]>>(
    () => bucketize(initialJobs, crews)
  );
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  // Re-sync when initialJobs change (parent re-fetches on date change).
  useEffect(() => {
    setJobsByCrew(bucketize(initialJobs, crews));
  }, [initialJobs, crews]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function findJob(id: string): { job: Job; fromCrew: string } | null {
    for (const [cid, list] of jobsByCrew.entries()) {
      const j = list.find((x) => x.id === id);
      if (j) return { job: j, fromCrew: cid };
    }
    return null;
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveJob(findJob(active.id as string)?.job ?? null);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveJob(null);
    if (!over) return;
    const overId = over.id as string;
    if (!overId.startsWith('day-col::')) return;

    const [, toLaneId, dateStr] = overId.split('::');
    const found = findJob(active.id as string);
    if (!found) return;
    if (found.fromCrew === toLaneId && localDateStr(date) === dateStr) return;

    const { job, fromCrew } = found;
    const isUnassigned = toLaneId === UNASSIGNED_LANE_ID;
    const newCrewId: string | null = isUnassigned ? null : toLaneId;
    const newCrew: Crew | null = isUnassigned
      ? null
      : (crews.find((c) => c.id === toLaneId) ?? null);

    // Optimistic
    setJobsByCrew((prev) => {
      const next = new Map(prev);
      next.set(fromCrew, (next.get(fromCrew) ?? []).filter((j) => j.id !== job.id));
      const updated: Job = {
        ...job,
        crew_id: newCrewId ?? undefined,
        crew: newCrew
          ? ({ id: newCrew.id, name: newCrew.name, color: newCrew.color } as unknown as Crew)
          : undefined,
        scheduled_date: dateStr,
      };
      next.set(toLaneId, [...(next.get(toLaneId) ?? []), updated]);
      return next;
    });

    const { error } = await supabase
      .from('jobs')
      .update({
        crew_id: newCrewId,
        scheduled_date: dateStr,
        status: isUnassigned
          ? job.status
          : (job.status === 'unscheduled' ? 'scheduled' : job.status),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (error) {
      // Revert
      setJobsByCrew((prev) => {
        const next = new Map(prev);
        next.set(toLaneId, (next.get(toLaneId) ?? []).filter((j) => j.id !== job.id));
        next.set(fromCrew, [...(next.get(fromCrew) ?? []), job]);
        return next;
      });
    }
  }

  // Current-time line position (only when viewing today)
  const showNowLine = isSameDate(date, new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - DAY_START_HOUR * 60) * PX_PER_MIN;
  const nowVisible =
    showNowLine && nowTop >= 0 && nowTop <= COLUMN_HEIGHT;

  // Time-slot ticks (for the left gutter)
  const slots: { label: string; top: number }[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
    slots.push({
      label: formatHourLabel(h),
      top: (h - DAY_START_HOUR) * 60 * PX_PER_MIN,
    });
  }

  if (crews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No crews yet — add crews on the{' '}
        <Link href="/dashboard/crews" className="underline">Crews page</Link>.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="relative">
        <div className="flex gap-3 overflow-x-auto pb-3">
          {/* Time gutter */}
          <div className="w-12 shrink-0 pt-7">
            <div className="relative" style={{ height: COLUMN_HEIGHT }}>
              {slots.map((s) => (
                <div
                  key={s.top}
                  className="absolute right-0 -translate-y-1/2 text-[10px] font-mono text-muted-foreground tabular-nums pr-1"
                  style={{ top: s.top }}
                >
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          {/* Crew columns — Unassigned first, then real crews. */}
          <div className="flex-1 flex gap-2 min-w-0">
            <CrewColumn
              key="unassigned"
              laneId={UNASSIGNED_LANE_ID}
              laneName="Unassigned"
              laneColor={UNASSIGNED_COLOR}
              jobs={jobsByCrew.get(UNASSIGNED_LANE_ID) ?? []}
              date={date}
            />
            {crews.map((crew) => (
              <CrewColumn
                key={crew.id}
                laneId={crew.id}
                laneName={crew.name}
                laneColor={crew.color}
                jobs={jobsByCrew.get(crew.id) ?? []}
                date={date}
              />
            ))}
          </div>
        </div>

        {/* "Now" line — sits inside the relative wrapper, above the columns. */}
        {nowVisible && (
          <div
            className="pointer-events-none absolute z-10"
            style={{ left: 60, right: 12, top: nowTop + 28 + 2 }}
            aria-hidden
          >
            <div className="relative">
              <span className="absolute -left-1.5 -top-1 inline-block h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
              <div className="h-px bg-red-500" />
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeJob && (
          <div className="w-48">
            <DraggableJobCard job={activeJob} isDragOverlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
