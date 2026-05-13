'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/shared/status-badge';
import { openDirections } from '@/lib/native-maps';
import { Truck, MapPin, Phone, Info, ChevronRight, Navigation, Loader2 } from 'lucide-react';
import type { Job } from '@/types';

export type JobCardClient = {
  id: string;
  name: string;
  service_address: string;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  access_notes?: string | null;
  gate_code?: string | null;
};

export type JobCardJob = Job & {
  client?: JobCardClient | null;
};

interface Props {
  job: JobCardJob;
  stopNumber: number;
  totalStops: number;
  /** Index 0 (first stop) shows "X min from HQ"; otherwise "from previous". */
  fromLabel: 'hq' | 'previous';
  /** True when this is the worker's *active* stop — gets the big Get Directions CTA. */
  isActive: boolean;
  /** Optional crew chip rendered above the title when worker is on multiple crews. */
  crewChip?: { name: string; color: string } | null;
  /** Receives this card's DOM node so the parent can scroll it into view. */
  registerRef?: (el: HTMLDivElement | null) => void;
}

function formatTime(t?: string | null): string | null {
  if (!t) return null;
  // scheduled_start is "HH:MM:SS" — convert to "8:00 AM"
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (!Number.isFinite(h)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function getCurrentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

export function JobCard({
  job,
  stopNumber,
  totalStops,
  fromLabel,
  isActive,
  crewChip,
  registerRef,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [navigating, setNavigating] = useState(false);

  const client = job.client ?? null;
  const driveMin = job.drive_minutes_from_previous;
  const driveMi = job.drive_distance_miles_from_previous;
  const timeLabel = formatTime(job.scheduled_start);

  // Heads-up text: collapse internal job notes + customer access notes into
  // a single warning row when present.
  const headsUp: string[] = [];
  if (job.notes) headsUp.push(job.notes);
  if (job.issue_notes) headsUp.push(job.issue_notes);
  if (client?.access_notes) headsUp.push(client.access_notes);
  if (client?.gate_code) headsUp.push(`Gate code: ${client.gate_code}`);

  async function handleGetDirections() {
    if (!client || !Number.isFinite(client.latitude) || !Number.isFinite(client.longitude)) {
      // Without coords we still attempt to open with an address-only URL.
      openDirections({
        lat: null,
        lng: null,
        address: [client?.service_address, client?.service_city, client?.service_state]
          .filter(Boolean)
          .join(', '),
      });
      return;
    }

    setNavigating(true);

    // Fire-and-forget: tell dispatch the crew is moving, compute ETA from
    // the worker's GPS when we can get a quick fix. We don't await this
    // before opening the maps app — the user shouldn't wait on us.
    const pos = await getCurrentPosition();
    const body: { origin_lat?: number; origin_lng?: number } = {};
    if (pos) {
      body.origin_lat = pos.coords.latitude;
      body.origin_lng = pos.coords.longitude;
    }
    void fetch(`/api/jobs/${job.id}/en-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      // Optimistic refresh so the status badge flips locally too. Failure
      // is fine — the next /today load will catch up.
      router.refresh();
    }).catch(() => {});

    // Optimistic status flip via the regular client, so the rest of the
    // UI (dispatch ETA tile, etc.) catches up via the next subscribe.
    void supabase
      .from('jobs')
      .update({ status: 'en_route', en_route_at: new Date().toISOString() })
      .eq('id', job.id);

    openDirections({
      lat: Number(client.latitude),
      lng: Number(client.longitude),
      address: [client.service_address, client.service_city, client.service_state]
        .filter(Boolean)
        .join(', '),
    });

    setTimeout(() => setNavigating(false), 1500);
  }

  return (
    <div
      ref={(el) => registerRef?.(el)}
      data-job-id={job.id}
      className="rounded-xl border bg-card overflow-hidden"
      style={{
        borderLeftWidth: 4,
        borderLeftColor: crewChip?.color ?? 'var(--color-brand-green-raw)',
      }}
    >
      {/* Drive-from-previous banner */}
      {Number.isFinite(driveMin) && driveMin && driveMin > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-xs text-muted-foreground border-b">
          <Truck className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold tabular-nums">{driveMin} min</span>
            {' '}from {fromLabel === 'hq' ? 'HQ' : 'previous'}
            {Number.isFinite(driveMi) && driveMi && driveMi > 0 ? (
              <> · <span className="tabular-nums">{driveMi.toFixed(1)} mi</span></>
            ) : null}
          </span>
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Stop {stopNumber} of {totalStops}</span>
              {timeLabel && <span className="text-foreground/80">· {timeLabel}</span>}
              {crewChip && (
                <span className="inline-flex items-center gap-1 normal-case font-normal tracking-normal">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: crewChip.color }} />
                  <span className="text-muted-foreground">{crewChip.name}</span>
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold leading-tight mt-0.5 truncate">{job.title}</h3>
            {client && (
              <>
                <div className="flex items-start gap-1.5 mt-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground min-w-0">
                    <p className="truncate font-medium text-foreground/80">{client.name}</p>
                    <p className="truncate">
                      {client.service_address}
                      {client.service_city ? `, ${client.service_city}` : ''}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="shrink-0">
            <StatusBadge status={job.status} type="job" />
          </div>
        </div>

        {headsUp.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
            {headsUp.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{line}</span>
              </div>
            ))}
          </div>
        )}

        {/* Primary CTA — only on the active stop. */}
        {isActive ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGetDirections}
              disabled={navigating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold text-white shadow-sm active:translate-y-px transition-transform"
              style={{ backgroundColor: 'var(--orange, #EA580C)' }}
            >
              {navigating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
              Get Directions
            </button>
            <div className="grid grid-cols-2 gap-2">
              {client?.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium active:opacity-70"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call {client.name.split(' ')[0]}
                </a>
              )}
              <Link
                href={`/job/${job.id}`}
                className={
                  client?.phone
                    ? 'inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium active:opacity-70'
                    : 'col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium active:opacity-70'
                }
              >
                Job Details
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <Link
            href={`/job/${job.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium active:opacity-70"
          >
            <span className="text-muted-foreground">View job</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  );
}
