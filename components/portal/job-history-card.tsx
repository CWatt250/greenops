'use client';

import { cn } from '@/lib/utils';
import type { Job } from '@/types';

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
  issue: { label: 'Issue', color: 'bg-red-100 text-red-700' },
  unscheduled: { label: 'Unscheduled', color: 'bg-gray-100 text-gray-500' },
};

interface Props {
  job: Job & { crew?: { name: string; color: string } | null };
  isUpcoming?: boolean;
}

export function JobHistoryCard({ job, isUpcoming }: Props) {
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.unscheduled;

  return (
    <div className={cn(
      'rounded-2xl border bg-white p-4 shadow-sm',
      isUpcoming && 'border-l-4'
    )}
    style={isUpcoming ? { borderLeftColor: 'var(--color-brand-green-raw)' } : {}}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{job.title}</p>
          {job.scheduled_date && (
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(`${job.scheduled_date}T12:00`).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
              {job.scheduled_start && (
                <span className="ml-1">
                  · {new Date(`1970-01-01T${job.scheduled_start}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </p>
          )}
          {job.crew && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: job.crew.color }}
              />
              <span className="text-xs text-gray-500">{job.crew.name}</span>
            </div>
          )}
          {job.notes && (
            <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-2.5 py-1.5 line-clamp-2">
              {job.notes}
            </p>
          )}
        </div>
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0', cfg.color)}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}
