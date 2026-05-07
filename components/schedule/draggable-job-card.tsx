'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

interface DraggableJobCardProps {
  job: Job;
  isDragOverlay?: boolean;
}

export function DraggableJobCard({ job, isDragOverlay = false }: DraggableJobCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative rounded-lg border bg-card p-2.5 text-xs cursor-grab active:cursor-grabbing select-none transition-shadow',
        isDragging && 'opacity-40 shadow-none',
        isDragOverlay && 'rotate-1 shadow-xl opacity-100 cursor-grabbing'
      )}
    >
      <p className="font-medium leading-tight truncate mb-1">{job.title}</p>
      {job.scheduled_start && (
        <p className="text-muted-foreground">{(job.scheduled_start as string).slice(0, 5)}</p>
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
