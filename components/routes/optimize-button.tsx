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
  disabled?: boolean;
}

export function OptimizeButton({ stops, onOptimized, disabled }: OptimizeButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleOptimize() {
    const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null);
    if (geocodedStops.length < 2) {
      toast.error('Need at least 2 geocoded stops to optimize.');
      return;
    }

    setState('loading');

    const vroomStops: VroomStop[] = geocodedStops.map((s, i) => ({
      id: i,
      location: [s.lng!, s.lat!],
      service: (s.estimated_duration_minutes ?? 30) * 60,
    }));

    const depot = routeCentroid(vroomStops.map((s) => s.location));

    // Calculate original total drive time
    const origDrive = stops.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);

    const orderedIds = await optimizeRoute(vroomStops, depot);

    if (!orderedIds) {
      setState('error');
      toast.error('Optimization service unavailable. Try again or reorder manually.');
      setTimeout(() => setState('idle'), 3000);
      return;
    }

    // Build the reordered stops array using the VROOM result indices
    const reordered: StopDraft[] = orderedIds.map((idx, position) => ({
      ...geocodedStops[idx],
      stop_order: position + 1,
    }));

    // Re-add any non-geocoded stops at the end
    const nonGeocoded = stops.filter((s) => s.lat === null || s.lng === null);
    const finalStops = [...reordered, ...nonGeocoded].map((s, i) => ({
      ...s,
      stop_order: i + 1,
    }));

    // Fetch new drive times from Mapbox matrix
    const geocodedCoords = reordered
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({ lat: s.lat!, lng: s.lng! }));

    const matrix = await getDriveMatrix(geocodedCoords);
    if (matrix) {
      for (let i = 1; i < finalStops.length; i++) {
        const driveSecs = matrix[i - 1]?.[i] ?? 0;
        finalStops[i] = {
          ...finalStops[i],
          drive_minutes_from_prev: Math.round(driveSecs / 60),
        };
      }
    }

    const newDrive = finalStops.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);
    const saved = Math.round(origDrive - newDrive);

    setState('success');
    onOptimized(finalStops);

    if (saved > 0) {
      toast.success(`Route optimized! Saved ~${saved} minutes of driving.`);
    } else {
      toast.success('Route optimized — already near-optimal!');
    }

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
    >
      {icons[state]}
      {labels[state]}
    </Button>
  );
}
