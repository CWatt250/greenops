'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createClient } from '@/lib/supabase/client';
import { DroppableCell } from './droppable-cell';
import { DraggableJobCard } from './draggable-job-card';
import type { Job, Crew } from '@/types';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isToday(date: Date): boolean {
  return toDateStr(date) === toDateStr(new Date());
}

function cellKey(crewId: string, dateStr: string) {
  return `cell::${crewId}::${dateStr}`;
}

function parseCellKey(key: string): { crewId: string; dateStr: string } | null {
  if (!key.startsWith('cell::')) return null;
  const rest = key.slice('cell::'.length);
  const lastSep = rest.lastIndexOf('::');
  return {
    crewId: rest.slice(0, lastSep),
    dateStr: rest.slice(lastSep + 2),
  };
}

interface ScheduleGridProps {
  weekStart: Date;
  crews: Crew[];
  initialJobs: Job[];
  unassignedInitial: Job[];
}

export function ScheduleGrid({ weekStart, crews, initialJobs, unassignedInitial }: ScheduleGridProps) {
  const supabase = createClient();
  const weekDates = getWeekDates(weekStart);

  // Build local job state: key -> jobs[]
  // Key format: "cell::crewId::YYYY-MM-DD" or "unscheduled"
  const [jobMap, setJobMap] = useState<Map<string, Job[]>>(() => {
    const map = new Map<string, Job[]>();
    map.set('unscheduled', unassignedInitial);
    for (const job of initialJobs) {
      if (!job.crew_id || !job.scheduled_date) {
        const prev = map.get('unscheduled') ?? [];
        map.set('unscheduled', [...prev, job]);
      } else {
        const key = cellKey(job.crew_id, job.scheduled_date);
        const prev = map.get(key) ?? [];
        map.set(key, [...prev, job]);
      }
    }
    return map;
  });

  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function findJobById(id: string): { job: Job; fromKey: string } | null {
    for (const [key, jobs] of jobMap.entries()) {
      const job = jobs.find((j) => j.id === id);
      if (job) return { job, fromKey: key };
    }
    return null;
  }

  function onDragStart({ active }: DragStartEvent) {
    const found = findJobById(active.id as string);
    setActiveJob(found?.job ?? null);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveJob(null);
    if (!over) return;

    const jobId = active.id as string;
    const toKey = over.id as string;
    const found = findJobById(jobId);
    if (!found) return;
    if (found.fromKey === toKey) return;

    const { job, fromKey } = found;

    // Optimistic update
    setJobMap((prev) => {
      const next = new Map(prev);
      // Remove from source
      next.set(fromKey, (next.get(fromKey) ?? []).filter((j) => j.id !== jobId));
      // Determine new crew/date
      let newCrewId: string | null = null;
      let newDate: string | null = null;
      if (toKey !== 'unscheduled') {
        const parsed = parseCellKey(toKey);
        if (parsed) { newCrewId = parsed.crewId; newDate = parsed.dateStr; }
      }
      const updatedJob: Job = { ...job, crew_id: newCrewId ?? undefined, scheduled_date: newDate ?? undefined };
      next.set(toKey, [...(next.get(toKey) ?? []), updatedJob]);
      return next;
    });

    // Write to Supabase
    let patch: Record<string, unknown>;
    if (toKey === 'unscheduled') {
      patch = { crew_id: null, scheduled_date: null, status: 'unscheduled' };
    } else {
      const parsed = parseCellKey(toKey);
      if (!parsed) return;
      patch = {
        crew_id: parsed.crewId,
        scheduled_date: parsed.dateStr,
        status: job.status === 'unscheduled' ? 'scheduled' : job.status,
      };
    }

    const { error } = await supabase
      .from('jobs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (error) {
      // Revert on error
      setJobMap((prev) => {
        const next = new Map(prev);
        next.set(toKey, (next.get(toKey) ?? []).filter((j) => j.id !== jobId));
        next.set(fromKey, [...(next.get(fromKey) ?? []), job]);
        return next;
      });
    }
  }

  const unscheduledJobs = jobMap.get('unscheduled') ?? [];

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {/* Unscheduled lane */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Unscheduled ({unscheduledJobs.length})
          </p>
          <DroppableCell id="unscheduled" className="bg-muted/30 min-h-[60px] flex flex-wrap gap-2 flex-row">
            {unscheduledJobs.map((job) => (
              <div key={job.id} className="w-48 shrink-0">
                <DraggableJobCard job={job} />
              </div>
            ))}
            {unscheduledJobs.length === 0 && (
              <p className="text-xs text-muted-foreground italic p-2">Drop here to unschedule</p>
            )}
          </DroppableCell>
        </div>

        {/* Weekly grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-1 mb-1">
              <div />
              {weekDates.map((date, i) => (
                <div
                  key={i}
                  className={cn(
                    'text-center py-1.5 rounded-lg text-xs font-semibold',
                    isToday(date) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  <span className="block">{DAY_LABELS[i]}</span>
                  <span className="block text-base leading-none font-bold mt-0.5">
                    {date.getDate()}
                  </span>
                </div>
              ))}
            </div>

            {/* Crew rows */}
            {crews.map((crew) => (
              <div key={crew.id} className="grid grid-cols-[140px_repeat(7,1fr)] gap-1 mb-1">
                {/* Crew label */}
                <div className="flex items-start gap-2 pt-2 pr-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full mt-0.5 shrink-0"
                    style={{ backgroundColor: crew.color }}
                  />
                  <span className="text-xs font-medium leading-tight">{crew.name}</span>
                </div>

                {/* Day cells */}
                {weekDates.map((date, dayIdx) => {
                  const dateStr = toDateStr(date);
                  const key = cellKey(crew.id, dateStr);
                  const dayJobs = jobMap.get(key) ?? [];

                  return (
                    <DroppableCell
                      key={dayIdx}
                      id={key}
                      isToday={isToday(date)}
                    >
                      {dayJobs.map((job) => (
                        <DraggableJobCard key={job.id} job={job} />
                      ))}
                    </DroppableCell>
                  );
                })}
              </div>
            ))}

            {crews.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No crews yet — add crews on the{' '}
                <a href="/dashboard/crews" className="underline">Crews page</a>.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
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
