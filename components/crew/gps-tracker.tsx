'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  /** Currently logged-in crew profile id. */
  profileId: string;
  /** Crew the user belongs to (used as the crew_id on each ping). */
  crewId: string | null;
  companyId: string;
  /** Whether to actively track. The /today page passes true only when
   *  the crew has at least one job with status='in_progress' so we
   *  preserve battery between jobs. */
  isActive: boolean;
}

const PING_INTERVAL_MS = 30_000;
const MAX_ACCURACY_M = 100;

/**
 * Headless-ish GPS tracker. Renders a small status banner so workers know
 * tracking is on; otherwise lets the watchPosition loop run quietly. Pings
 * are throttled to ~30s (regardless of how often the device updates) and
 * low-accuracy reads (>100m) are dropped.
 */
export function GPSTracker({ profileId, crewId, companyId, isActive }: Props) {
  const supabase = createClient();
  const lastPushRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRunning(false);
    setPermissionDenied(false);

    if (!isActive) return;
    if (typeof window === 'undefined') return;
    if (!('geolocation' in navigator)) return;

    let cancelled = false;

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        if (cancelled) return;
        setRunning(true);

        const now = Date.now();
        if (now - lastPushRef.current < PING_INTERVAL_MS) return;
        if (typeof pos.coords.accuracy === 'number' && pos.coords.accuracy > MAX_ACCURACY_M) return;

        lastPushRef.current = now;
        try {
          await supabase.from('crew_locations').insert({
            company_id: companyId,
            profile_id: profileId,
            crew_id: crewId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy ?? null,
            speed_mps: pos.coords.speed ?? null,
            heading: pos.coords.heading ?? null,
            recorded_at: new Date(pos.timestamp).toISOString(),
          });
        } catch {
          // Network blip — next watchPosition tick will retry.
        }
      },
      (err) => {
        if (cancelled) return;
        if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );

    watchIdRef.current = id;
    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, profileId, crewId, companyId]);

  if (!isActive) return null;

  if (permissionDenied) {
    return (
      <div
        className="rounded-lg border px-3 py-2 text-xs flex items-start gap-2 mb-3"
        style={{
          backgroundColor: 'var(--orange-soft)',
          borderColor: 'var(--orange)',
          color: 'var(--orange-deep)',
        }}
        role="alert"
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Location off.</strong> Enable Location for this app so dispatch
          can see you on the map. iPhone: Settings → Safari → Location.
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2 mb-3"
      style={{
        backgroundColor: 'var(--muted, #F5F5F0)',
        borderColor: 'var(--border, #E0DCCD)',
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${running ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: running ? 'var(--orange)' : 'var(--muted-foreground)' }}
      />
      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        {running ? 'GPS active — sharing position with dispatch' : 'Waiting for GPS fix…'}
      </span>
    </div>
  );
}
