'use client';

import { cn } from '@/lib/utils';
import type { Complaint } from '@/types';

const SEVERITY_CONFIG = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  high: { label: 'High', color: 'bg-red-100 text-red-700' },
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-gray-100 text-gray-600' },
  reviewing: { label: 'Reviewing', color: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-500' },
};

interface Props {
  complaint: Complaint;
}

export function ComplaintCard({ complaint }: Props) {
  const sev = SEVERITY_CONFIG[complaint.severity];
  const sts = STATUS_CONFIG[complaint.status];

  return (
    <div className={cn(
      'rounded-2xl border bg-white p-4 shadow-sm',
      complaint.severity === 'high' && 'border-l-4 border-l-red-500'
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-sm flex-1 min-w-0 truncate">{complaint.title}</p>
        <div className="flex gap-1.5 shrink-0">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', sev.color)}>
            {sev.label}
          </span>
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', sts.color)}>
            {sts.label}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-600 line-clamp-2">{complaint.description}</p>
      {complaint.resolution_notes && (
        <div className="mt-2.5 rounded-xl bg-green-50 border border-green-200 px-3 py-2">
          <p className="text-xs font-semibold text-green-700 mb-0.5">Resolution from TLC:</p>
          <p className="text-xs text-green-600">{complaint.resolution_notes}</p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">
        {new Date(complaint.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  );
}
