'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

interface DraggableJobCardProps {
  job: Job;
  isDragOverlay?: boolean;
  /**
   * If a draggable card is rendered inside a container that already shows
   * the crew, pass `compact` to suppress the duplicate crew-color dot.
   */
  compact?: boolean;
}

function tintFromHex(hex: string, alpha: number): string {
  // Convert "#RRGGBB" → "rgba(r, g, b, alpha)"
  const m = hex.replace('#', '').match(/.{1,2}/g);
  if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = m.map((p) => parseInt(p, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function DraggableJobCard({ job, isDragOverlay = false, compact = false }: DraggableJobCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  // The schedule page joins crew(name, color); shape arrives via job.crew.
  const crewColor =
    (job.crew as { color?: string } | undefined)?.color ?? null;

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
      {...listeners}
      {...attributes}
      className={cn(
        'group relative rounded-lg border bg-card p-2.5 text-xs cursor-grab active:cursor-grabbing select-none transition-shadow',
        isDragging && 'opacity-40 shadow-none',
        isDragOverlay && 'rotate-1 shadow-xl opacity-100 cursor-grabbing'
      )}
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
  );
}
