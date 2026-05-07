import { cn } from '@/lib/utils';
import type { JobStatus, ClientStatus } from '@/types';

const jobStatusConfig: Record<JobStatus, { label: string; className: string }> = {
  unscheduled: { label: 'Unscheduled', className: 'bg-gray-100 text-gray-700' },
  scheduled:   { label: 'Scheduled',   className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  complete:    { label: 'Complete',    className: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',  className: 'bg-gray-100 text-gray-500 line-through' },
  issue:       { label: 'Issue',       className: 'bg-red-100 text-red-700' },
};

const clientStatusConfig: Record<ClientStatus, { label: string; className: string }> = {
  active:   { label: 'Active',   className: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-500' },
  prospect: { label: 'Prospect', className: 'bg-blue-100 text-blue-700' },
  lead:     { label: 'Lead',     className: 'bg-amber-100 text-amber-700' },
};

interface StatusBadgeProps {
  status: JobStatus | ClientStatus;
  type?: 'job' | 'client';
  className?: string;
}

export function StatusBadge({ status, type = 'job', className }: StatusBadgeProps) {
  const config =
    type === 'job'
      ? jobStatusConfig[status as JobStatus]
      : clientStatusConfig[status as ClientStatus];

  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
