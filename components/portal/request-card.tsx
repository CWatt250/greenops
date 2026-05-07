'use client';

import { cn } from '@/lib/utils';
import type { ServiceRequest } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  new_service: '🌿 New Service',
  reschedule: '📅 Reschedule',
  quote_request: '💰 Quote Request',
  cancel: '❌ Cancel',
  seasonal: '🍂 Seasonal',
  other: '💬 Other',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600' },
  reviewing: { label: 'Reviewing', color: 'bg-blue-100 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700' },
};

interface Props {
  request: ServiceRequest;
}

export function RequestCard({ request }: Props) {
  const cfg = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{TYPE_LABELS[request.type] ?? request.type}</p>
          <p className="font-semibold text-sm truncate">{request.title}</p>
        </div>
        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0', cfg.color)}>
          {cfg.label}
        </span>
      </div>
      {request.description && (
        <p className="text-xs text-gray-600 line-clamp-2">{request.description}</p>
      )}
      {request.preferred_date && (
        <p className="text-xs text-gray-500 mt-1.5">
          Preferred: {new Date(`${request.preferred_date}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {request.preferred_time && ` at ${request.preferred_time}`}
        </p>
      )}
      {request.admin_notes && request.status !== 'pending' && (
        <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700 font-medium">TLC Note:</p>
          <p className="text-xs text-blue-600 mt-0.5">{request.admin_notes}</p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">
        {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>
    </div>
  );
}
