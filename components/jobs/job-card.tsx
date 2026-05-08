'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { CrewAssignSelect } from '@/components/jobs/crew-assign-select';
import { formatDate, cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import type { Crew, Job } from '@/types';

interface JobCardProps {
  job: Job;
  /** When provided, renders an inline crew dropdown instead of a static label. */
  crews?: Crew[];
  onCrewChange?: (newCrewId: string | null) => void;
  /** Bulk-select support. When `selectable`, a checkbox is rendered. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}

export function JobCard({
  job,
  crews,
  onCrewChange,
  selectable,
  selected,
  onSelectChange,
}: JobCardProps) {
  const crew = job.crew as { id: string; name: string; color?: string } | null;
  const inlineCrews = crews && crews.length > 0;

  return (
    <div className={cn(
      'relative rounded-xl border bg-card p-5 transition-all',
      selected
        ? 'ring-2 ring-[var(--orange)] shadow-md'
        : 'hover:shadow-md hover:-translate-y-0.5'
    )}>
      {selectable && (
        <label
          className="absolute top-2.5 left-2.5 z-10 inline-flex items-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-[var(--orange)] cursor-pointer"
            checked={!!selected}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            aria-label="Select job"
          />
        </label>
      )}

      <Link
        href={`/dashboard/jobs/${job.id}`}
        className="block"
      >
        <div className={cn(
          'flex items-start justify-between gap-3 mb-3',
          selectable && 'pl-7'
        )}>
          <h3 className="font-semibold text-sm leading-tight">{job.title}</h3>
          <StatusBadge status={job.status} type="job" />
        </div>

        <div className="space-y-1.5">
          {job.scheduled_date && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(job.scheduled_date)}
              {job.scheduled_start && ` at ${job.scheduled_start.slice(0, 5)}`}
            </div>
          )}
          {job.client && (
            <div className="text-xs text-muted-foreground truncate">
              {(job.client as { name: string }).name}
            </div>
          )}
        </div>
      </Link>

      {/* Inline crew control — outside the Link so clicks don't navigate. */}
      <div className="mt-2">
        {inlineCrews ? (
          <CrewAssignSelect
            jobId={job.id}
            currentCrewId={job.crew_id ?? null}
            currentCrewName={crew?.name ?? null}
            currentCrewColor={crew?.color ?? null}
            crews={crews!}
            onAssigned={onCrewChange}
            variant="chip"
          />
        ) : crew ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: crew.color ?? 'var(--orange)' }}
            />
            {crew.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}
