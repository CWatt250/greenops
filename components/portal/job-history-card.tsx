'use client';

import { useState } from 'react';
import { Camera, X, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fileSrc } from '@/lib/storage';
import type { Job } from '@/types';

const STATUS_CONFIG = {
  scheduled:   { label: 'Scheduled',   color: 'bg-blue-100 text-blue-700' },
  en_route:    { label: 'En Route',    color: 'bg-orange-100 text-orange-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  complete:    { label: 'Complete',    color: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   color: 'bg-gray-100 text-gray-500' },
  issue:       { label: 'Issue',       color: 'bg-red-100 text-red-700' },
  unscheduled: { label: 'Unscheduled', color: 'bg-gray-100 text-gray-500' },
};

export interface JobPhoto {
  id: string;
  url: string;
  caption: string | null;
}

interface Props {
  job: Job & { crew?: { name: string; color: string } | null };
  isUpcoming?: boolean;
  /** Photos for this job — caller passes a pre-resolved publicUrl per row. */
  photos?: JobPhoto[];
}

export function JobHistoryCard({ job, isUpcoming, photos = [] }: Props) {
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.unscheduled;
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isComplete = job.status === 'complete';
  const hasProof = isComplete && (photos.length > 0 || !!job.signature_url);

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border bg-white p-4 shadow-sm',
          isUpcoming && 'border-l-4',
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
            {/* Customer-visible note. job.notes is intentionally NOT shown
             *  here — that field is reserved for crew-internal scratch. */}
            {job.customer_notes && (
              <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-2.5 py-1.5 line-clamp-3">
                {job.customer_notes}
              </p>
            )}
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0',
              cfg.color,
            )}
          >
            {cfg.label}
          </span>
        </div>

        {hasProof && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Completion proof
            </p>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {photos.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setLightbox(p.url)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 active:opacity-80 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption ?? 'Job photo'} className="w-full h-full object-cover" />
                    {p.caption && (
                      <span
                        className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                        style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
                      >
                        {p.caption}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {job.signature_url && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-gray-50/60 px-3 py-2">
                <PenLine className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Signed by
                  </p>
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {job.signed_by_name ?? 'Customer'}
                    {job.signed_at && (
                      <span className="text-gray-500 font-normal">
                        {' '}· {new Date(job.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightbox(fileSrc('job-signatures', job.signature_url))}
                  className="text-xs text-gray-600 underline-offset-2 hover:underline"
                >
                  View
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tiny photo count badge if proof exists but card is collapsed */}
        {photos.length === 0 && isComplete && !job.signature_url && (
          <p className="mt-2 text-[10px] text-gray-400 italic">
            <Camera className="inline h-3 w-3 -mt-0.5 mr-1" />
            No photos uploaded for this visit.
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
          aria-label="Close photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
          <span
            className="absolute top-4 right-4 rounded-full bg-white/90 p-2 shadow"
            aria-hidden
          >
            <X className="h-4 w-4" />
          </span>
        </button>
      )}
    </>
  );
}
