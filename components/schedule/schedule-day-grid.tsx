'use client';

import { useEffect, useState } from 'react';
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

interface ScheduleDayGridProps {
  date: Date;
  crews: Crew[];
  initialJobs: Job[];
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isSameDate(a: Date, b: Date): boolean {
  return toDateStr(a) === toDateStr(b);
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
  crew,
  jobs,
  date,
}: {
  crew: Crew;
  jobs: Job[];
  date: Date;
}) {
  const dropId = `day-col::${crew.id}::${toDateStr(date)}`;
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  return (
    <div className="flex-1 min-w-0">
      <div
        className="flex items-center gap-2 px-2 py-1.5 mb-1 border-b"
        style={{ borderBottomColor: crew.color }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: crew.color }}
        />
        <span className="text-xs font-semibold truncate">{crew.name}</span>
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
  const [jobsByCrew, setJobsByCrew] = useState<Map<string, Job[]>>(() => {
    const map = new Map<string, Job[]>();
    for (const c of crews) map.set(c.id, []);
    for (const j of initialJobs) {
      if (!j.crew_id) continue;
      const list = map.get(j.crew_id) ?? [];
      list.push(j);
      map.set(j.crew_id, list);
    }
    return map;
  });
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  // Re-sync when initialJobs change (parent re-fetches on date change).
  useEffect(() => {
    const map = new Map<string, Job[]>();
    for (const c of crews) map.set(c.id, []);
    for (const j of initialJobs) {
      if (!j.crew_id) continue;
      const list = map.get(j.crew_id) ?? [];
      list.push(j);
      map.set(j.crew_id, list);
    }
    setJobsByCrew(map);
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

    const [, toCrewId, dateStr] = overId.split('::');
    const found = findJob(active.id as string);
    if (!found) return;
    if (found.fromCrew === toCrewId && toDateStr(date) === dateStr) return;

    const { job, fromCrew } = found;

    // Optimistic
    setJobsByCrew((prev) => {
      const next = new Map(prev);
      next.set(fromCrew, (next.get(fromCrew) ?? []).filter((j) => j.id !== job.id));
      const updated: Job = { ...job, crew_id: toCrewId, scheduled_date: dateStr };
      next.set(toCrewId, [...(next.get(toCrewId) ?? []), updated]);
      return next;
    });

    const { error } = await supabase
      .from('jobs')
      .update({
        crew_id: toCrewId,
        scheduled_date: dateStr,
        status: job.status === 'unscheduled' ? 'scheduled' : job.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (error) {
      // Revert
      setJobsByCrew((prev) => {
        const next = new Map(prev);
        next.set(toCrewId, (next.get(toCrewId) ?? []).filter((j) => j.id !== job.id));
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
        <a href="/dashboard/crews" className="underline">Crews page</a>.
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

          {/* Crew columns */}
          <div className="flex-1 flex gap-2 min-w-0">
            {crews.map((crew) => (
              <CrewColumn
                key={crew.id}
                crew={crew}
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
