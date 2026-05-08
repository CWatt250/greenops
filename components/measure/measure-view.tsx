'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ShapeList } from './shape-list';
import { AreaSummary } from './area-summary';
import { Button } from '@/components/ui/button';
import { AddStopInput } from '@/components/routes/add-stop-input';
import { createClient } from '@/lib/supabase/client';
import { geocodeAddress, type PlaceSuggestion } from '@/lib/mapbox';
import { totalsByType, type MeasuredShape } from '@/lib/measurement';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import type { PropertyMeasurement } from '@/types';

const MeasureMap = dynamic(() => import('./measure-map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface Props {
  companyId: string;
  userId: string;
  /** When set, save targets this client. */
  clientId?: string;
  clientName?: string;
  initialAddress?: string;
  /** Pre-load a previously saved measurement. */
  initial?: PropertyMeasurement | null;
  backHref?: string;
}

export function MeasureView({
  companyId,
  userId,
  clientId,
  clientName,
  initialAddress,
  initial,
  backHref = '/dashboard',
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [center, setCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [shapes, setShapes] = useState<MeasuredShape[]>(() => {
    if (!initial) return [];
    if (Array.isArray(initial.shapes)) return initial.shapes as MeasuredShape[];
    return [];
  });
  const [searching, setSearching] = useState(!!initialAddress);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Resolve the initial address → center.
  useEffect(() => {
    if (!initialAddress) return;
    let cancelled = false;
    (async () => {
      setSearching(true);
      const coords = await geocodeAddress(initialAddress);
      if (!cancelled) {
        if (coords) setCenter({ lng: coords[0], lat: coords[1] });
        else setHint(`Couldn't geocode "${initialAddress}".`);
        setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialAddress]);

  const totals = useMemo(() => totalsByType(shapes), [shapes]);

  function updateShape(id: string, patch: Partial<MeasuredShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    // Note: removing from React state doesn't remove from the Mapbox Draw
    // layer. Recommend the user clicks the trash button on the map for the
    // selected shape. This is a known v1 limitation; flagged in commit.
  }

  function handlePlace(place: PlaceSuggestion) {
    setCenter({ lng: place.lng, lat: place.lat });
  }

  async function handleSave() {
    if (!clientId) {
      toast.error('Open this tool from a client to save the measurement.');
      return;
    }
    if (shapes.length === 0) {
      toast.error('Draw at least one shape before saving.');
      return;
    }
    setSaving(true);

    const payload = {
      company_id: companyId,
      client_id: clientId,
      measured_by: userId,
      total_turf_sqft: totals.turf,
      total_hardscape_sqft: totals.hardscape,
      total_bed_sqft: totals.bed,
      total_other_sqft: totals.other,
      shapes: shapes,
    };

    const { data: measurement, error } = await supabase
      .from('property_measurements')
      .insert(payload)
      .select('id')
      .single();

    setSaving(false);

    if (error || !measurement) {
      toast.error(error?.message ?? 'Failed to save measurement.');
      return;
    }

    // Mark as the client's primary measurement.
    await supabase
      .from('clients')
      .update({ primary_measurement_id: measurement.id })
      .eq('id', clientId);

    toast.success(`Measurement saved — ${totals.turf.toLocaleString()} sq ft of turf.`);
    router.push(backHref);
    router.refresh();
  }

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden flex-col md:flex-row"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* MAP — fills most of the viewport */}
      <div className="flex-1 relative min-h-[300px]">
        {searching && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur-sm border shadow px-3 py-1.5 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Locating address…
          </div>
        )}
        <MeasureMap
          center={center}
          shapes={shapes}
          onShapesChange={setShapes}
        />
      </div>

      {/* RIGHT PANEL */}
      <aside className="md:w-[360px] shrink-0 border-l bg-background overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <h1
              className="page-title"
              style={{ fontSize: 22 }}
            >
              Measure Property
            </h1>
            {clientName && (
              <p className="text-xs text-muted-foreground mt-0.5">{clientName}</p>
            )}
          </div>

          {/* Address search */}
          <AddStopInput onAdd={handlePlace} crewColor="var(--orange)" />
          {hint && (
            <p className="text-[11px] text-amber-700">{hint}</p>
          )}

          {/* Mobile accuracy nudge */}
          <p className="md:hidden rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            💡 For best accuracy, measure on desktop.
          </p>

          {/* Shape list */}
          <ShapeList
            shapes={shapes}
            onUpdate={updateShape}
            onRemove={removeShape}
          />

          {/* Totals + pricing */}
          <AreaSummary shapes={shapes} />

          {/* Save */}
          {clientId ? (
            <Button
              onClick={handleSave}
              disabled={saving || shapes.length === 0}
              className="w-full gap-1.5"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Save className="h-3.5 w-3.5" />}
              Save Measurement
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground italic text-center">
              Open this tool from a client page to save measurements.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
