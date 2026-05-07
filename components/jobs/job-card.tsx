import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import { Calendar, Users } from 'lucide-react';
import type { Job } from '@/types';

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl border bg-card p-5 hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
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
        {job.crew && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {(job.crew as { name: string }).name}
          </div>
        )}
      </div>
    </Link>
  );
}
