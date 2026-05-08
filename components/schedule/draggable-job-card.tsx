'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from '@/components/shared/status-badge';
import { CrewAssignSelect } from '@/components/jobs/crew-assign-select';
import { cn } from '@/lib/utils';
import type { Crew, Job } from '@/types';

interface DraggableJobCardProps {
  job: Job;
  isDragOverlay?: boolean;
  /**
   * If a draggable card is rendered inside a container that already shows
   * the crew (e.g. the day-view crew column), pass `compact` to hide the
   * crew dot and skip the inline crew picker.
   */
  compact?: boolean;
  /** Pass the active crew list to enable the inline reassign dropdown. */
  crews?: Crew[];
  /** Notify the parent so it can move the job between cells optimistically. */
  onCrewChange?: (newCrewId: string | null) => void;
}

function tintFromHex(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/.{1,2}/g);
  if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = m.map((p) => parseInt(p, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function DraggableJobCard({
  job,
  isDragOverlay = false,
  compact = false,
  crews,
  onCrewChange,
}: DraggableJobCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const crew = job.crew as { id: string; name: string; color?: string } | undefined;
  const crewColor = crew?.color ?? null;

  const cardStyle: React.CSSProperties = {
    ...(style ?? {}),
    ...(crewColor
      ? {
          borderLeft: `4px solid ${crewColor}`,
          backgroundColor: tintFromHex(crewColor, 0.08),
        }
      : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={cn(
        'group relative rounded-lg border bg-card p-2.5 text-xs select-none transition-shadow',
        isDragging && 'opacity-40 shadow-none',
        isDragOverlay && 'rotate-1 shadow-xl opacity-100 cursor-grabbing'
      )}
    >
      {/* Drag-only zone — only this region triggers DnD. The crew chip below
          is interactive and shouldn't start a drag. */}
      <div
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing"
      >
        {crewColor && !compact && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: crewColor }}
            aria-hidden
          />
        )}
        <p className="font-medium leading-tight truncate mb-1 pr-3">{job.title}</p>
        {job.scheduled_start && (
          <p className="text-muted-foreground tabular-nums">
            {(job.scheduled_start as string).slice(0, 5)}
          </p>
        )}
        {(job.client as { name: string } | null)?.name && (
          <p className="text-muted-foreground truncate mt-0.5">
            {(job.client as { name: string }).name}
          </p>
        )}
        <div className="mt-1.5">
          <StatusBadge status={job.status} type="job" />
        </div>
      </div>

      {!compact && crews && crews.length > 0 && (
        <div className="mt-1.5">
          <CrewAssignSelect
            jobId={job.id}
            currentCrewId={job.crew_id ?? null}
            currentCrewName={crew?.name ?? null}
            currentCrewColor={crewColor}
            crews={crews}
            onAssigned={onCrewChange}
            variant="chip"
          />
        </div>
      )}
    </div>
  );
}
