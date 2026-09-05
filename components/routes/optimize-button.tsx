'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { optimizeRoute, routeCentroid, type VroomStop } from '@/lib/vroom';
import { getDriveMatrix } from '@/lib/mapbox';
import { toast } from 'sonner';
import type { StopDraft } from './stop-list';

interface OptimizeButtonProps {
  stops: StopDraft[];
  onOptimized: (reorderedStops: StopDraft[]) => void;
  /** Skills the single selected crew is certified for (migration 045). */
  vehicleSkills?: number[];
  /** Called with the stops VROOM couldn't assign to this crew (skill lock).
   *  Empty array = everything routed. Drives the unroutable banner. */
  onUnroutable?: (blocked: StopDraft[]) => void;
  disabled?: boolean;
}

export interface SingleOptimizeResult {
  finalStops: StopDraft[];
  blocked: StopDraft[];
  /** Minutes of driving saved vs the incoming order (may be ≤ 0). */
  saved: number;
}

/**
 * Single-crew VROOM optimization, shared by the button and the route
 * builder's one-tap path. Returns null when the service is unavailable.
 */
export async function optimizeSingleStops(stops: StopDraft[], vehicleSkills?: number[]): Promise<SingleOptimizeResult | null> {
  const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null);
  const vroomStops: VroomStop[] = geocodedStops.map((s, i) => ({
    id: i,
    location: [s.lng!, s.lat!],
    service: (s.estimated_duration_minutes ?? 30) * 60,
    ...(s.skills && s.skills.length > 0 ? { skills: s.skills } : {}),
  }));
  const depot = routeCentroid(vroomStops.map((s) => s.location));
  const origDrive = stops.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);
  const orderedIds = await optimizeRoute(vroomStops, depot, vehicleSkills);
  if (!orderedIds) return null;
  const reordered: StopDraft[] = orderedIds.map((idx, position) => ({ ...geocodedStops[idx], stop_order: position + 1 }));
  const assignedIdx = new Set(orderedIds);
  const blocked: StopDraft[] = geocodedStops.filter((_, i) => !assignedIdx.has(i));
  const nonGeocoded = stops.filter((s) => s.lat === null || s.lng === null);
  const finalStops = [...reordered, ...blocked, ...nonGeocoded].map((s, i) => ({ ...s, stop_order: i + 1 }));
  const geocodedCoords = reordered.map((s) => ({ lat: s.lat!, lng: s.lng! }));
  const matrix = await getDriveMatrix(geocodedCoords);
  if (matrix) {
    for (let i = 1; i < finalStops.length; i++) {
      const driveSecs = matrix[i - 1]?.[i] ?? 0;
      finalStops[i] = { ...finalStops[i], drive_minutes_from_prev: Math.round(driveSecs / 60) };
    }
  }
  const newDrive = finalStops.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);
  return { finalStops, blocked, saved: Math.round(origDrive - newDrive) };
}

export function OptimizeButton({ stops, onOptimized, vehicleSkills, onUnroutable, disabled }: OptimizeButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleOptimize() {
    const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null);
    if (geocodedStops.length < 2) {
      toast.error('Need at least 2 geocoded stops to optimize.');
      return;
    }

    setState('loading');
    const result = await optimizeSingleStops(stops, vehicleSkills);
    if (!result) {
      setState('error');
      toast.error('Optimization service unavailable. Try again or reorder manually.');
      setTimeout(() => setState('idle'), 3000);
      return;
    }
    const { finalStops, blocked, saved } = result;
    onUnroutable?.(blocked);
    if (blocked.length > 0) {
      toast.warning(
        `${blocked.length} stop${blocked.length === 1 ? '' : 's'} couldn't be routed — this crew isn't certified for the required service(s).`,
      );
    }
    setState('success');
    onOptimized(finalStops);
    if (saved > 0) toast.success(`Route optimized! Saved ~${saved} minutes of driving.`);
    else toast.success('Route optimized — already near-optimal!');
    setTimeout(() => setState('idle'), 4000);
  }

  const icons = {
    idle: <Sparkles className="h-4 w-4" />,
    loading: <Loader2 className="h-4 w-4 animate-spin" />,
    success: <CheckCircle2 className="h-4 w-4" />,
    error: <AlertCircle className="h-4 w-4" />,
  };

  const labels = {
    idle: 'Optimize Route',
    loading: 'Optimizing…',
    success: 'Optimized!',
    error: 'Failed',
  };

  return (
    <Button
      size="sm"
      onClick={handleOptimize}
      disabled={disabled || state === 'loading' || stops.length < 2}
      style={
        state === 'idle' || state === 'loading'
          ? { backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }
          : undefined
      }
      variant={state === 'success' ? 'default' : state === 'error' ? 'destructive' : 'default'}
      className="gap-1.5"
      title="Auto-sequence stops to minimize total drive time (VROOM)"
    >
      {icons[state]}
      {labels[state]}
    </Button>
  );
}
