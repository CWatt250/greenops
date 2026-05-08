'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ShapeList } from './shape-list';
import { AreaSummary } from './area-summary';
import { InstructionsBanner } from './instructions-banner';
import { Button } from '@/components/ui/button';
import { AddStopInput } from '@/components/routes/add-stop-input';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { createClient } from '@/lib/supabase/client';
import { geocodeAddress, type PlaceSuggestion } from '@/lib/mapbox';
import { totalsByType, type MeasuredShape } from '@/lib/measurement';
import { staticMapUrlForShapes } from '@/lib/measurement-static-map';
import { toast } from 'sonner';
import {
  ChevronLeft, Loader2, Save, FileDown, ChevronDown, User, Globe,
} from 'lucide-react';
import Link from 'next/link';
import type { Client, PropertyMeasurement } from '@/types';

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
  /** Optional: locks the save target to a specific client (e.g. /clients/[id]/measure). */
  lockedClientId?: string;
  lockedClientName?: string;
  initialAddress?: string;
  initial?: PropertyMeasurement | null;
  backHref?: string;
  /** When true, shows the standalone "client picker / save standalone" UI. */
  standalone?: boolean;
}

export function MeasureView({
  companyId,
  userId,
  lockedClientId,
  lockedClientName,
  initialAddress,
  initial,
  backHref = '/dashboard',
  standalone = false,
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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Standalone mode: pick a client at save-time (or save without one).
  const [selectedClientId, setSelectedClientId] = useState<string>(lockedClientId ?? '');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);

  // Address shown in the PDF — kept in sync with whatever is searched.
  const [addressLabel, setAddressLabel] = useState(initialAddress ?? '');

  const focusShapeRef = useRef<((id: string) => void) | null>(null);

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
  }
  function reorderShapes(next: MeasuredShape[]) {
    setShapes(next);
  }
  function focusShape(id: string) {
    focusShapeRef.current?.(id);
  }
  function handlePlace(place: PlaceSuggestion) {
    setCenter({ lng: place.lng, lat: place.lat });
    setAddressLabel(place.placeName);
  }

  async function persistMeasurement(targetClientId: string | null): Promise<string | null> {
    setSaving(true);
    const payload = {
      company_id: companyId,
      client_id: targetClientId,
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
      return null;
    }
    if (targetClientId) {
      await supabase
        .from('clients')
        .update({ primary_measurement_id: measurement.id })
        .eq('id', targetClientId);
    }
    return measurement.id;
  }

  async function saveLocked() {
    if (!lockedClientId) return;
    if (shapes.length === 0) {
      toast.error('Draw at least one shape before saving.');
      return;
    }
    const id = await persistMeasurement(lockedClientId);
    if (!id) return;
    toast.success(`Measurement saved — ${totals.turf.toLocaleString()} sq ft of turf.`);
    router.push(backHref);
    router.refresh();
  }

  async function saveToPickedClient() {
    if (!selectedClientId) {
      toast.error('Pick a client first.');
      return;
    }
    if (shapes.length === 0) {
      toast.error('Draw at least one shape before saving.');
      return;
    }
    setSaveMenuOpen(false);
    const id = await persistMeasurement(selectedClientId);
    if (!id) return;
    toast.success(`Measurement saved to ${selectedClient?.name ?? 'client'}.`);
    router.push(`/dashboard/clients/${selectedClientId}`);
    router.refresh();
  }

  async function saveStandalone() {
    if (shapes.length === 0) {
      toast.error('Draw at least one shape before saving.');
      return;
    }
    setSaveMenuOpen(false);
    const id = await persistMeasurement(null);
    if (!id) return;
    toast.success('Measurement saved (standalone — no client linked).');
    // No client to redirect to; stay on the page so dispatcher can keep
    // measuring or PDF-export. Refresh keeps state crisp.
    router.refresh();
  }

  async function downloadPdf() {
    if (shapes.length === 0) {
      toast.error('Draw at least one shape first.');
      return;
    }
    setPdfBusy(true);
    try {
      const [{ pdf }, { MeasurementDocument }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/measurement-pdf'),
        import('react'),
      ]);
      const staticMapUrl = staticMapUrlForShapes(shapes, center);
      const clientName =
        lockedClientName ?? selectedClient?.name ?? null;
      const doc = React.default.createElement(MeasurementDocument, {
        shapes,
        address: addressLabel || null,
        clientName,
        staticMapUrl,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().split('T')[0];
      const slug = (clientName ?? addressLabel ?? 'property').replace(/[^a-z0-9-]+/gi, '_').slice(0, 40);
      a.href = url;
      a.download = `Measurement-${slug}-${ts}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF generation failed.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden flex-col md:flex-row"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* MAP */}
      <div className="flex-1 relative min-h-[300px] flex flex-col">
        <InstructionsBanner />
        <div className="flex-1 relative">
          {searching && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur-sm border shadow px-3 py-1.5 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Locating address…
            </div>
          )}
          <MeasureMap
            center={center}
            shapes={shapes}
            onShapesChange={setShapes}
            focusShapeRef={focusShapeRef}
          />
        </div>
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
            <h1 className="page-title" style={{ fontSize: 22 }}>
              Measure Property
            </h1>
            {lockedClientName && (
              <p className="text-xs text-muted-foreground mt-0.5">{lockedClientName}</p>
            )}
            {!lockedClientName && selectedClient && (
              <p className="text-xs text-muted-foreground mt-0.5">{selectedClient.name}</p>
            )}
          </div>

          {/* Address search + (standalone) client picker */}
          <AddStopInput onAdd={handlePlace} crewColor="var(--orange)" />
          {hint && (
            <p className="text-[11px] text-amber-700">{hint}</p>
          )}

          {standalone && !lockedClientId && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Or pick a client
              </p>
              <ClientCombobox
                value={selectedClientId}
                onChange={(id, c) => {
                  setSelectedClientId(id);
                  setSelectedClient(c);
                  if (c?.service_address) {
                    setAddressLabel([
                      c.service_address, c.service_city, c.service_state, c.service_zip,
                    ].filter(Boolean).join(', '));
                    void geocodeAddress(
                      [c.service_address, c.service_city, c.service_state, c.service_zip]
                        .filter(Boolean).join(', ')
                    ).then((coords) => {
                      if (coords) setCenter({ lng: coords[0], lat: coords[1] });
                    });
                  }
                }}
                placeholder="Search existing clients…"
              />
            </div>
          )}

          {/* Shape list */}
          <ShapeList
            shapes={shapes}
            onUpdate={updateShape}
            onRemove={removeShape}
            onReorder={reorderShapes}
            onFocus={focusShape}
          />

          {/* Totals + pricing */}
          <AreaSummary shapes={shapes} />

          {/* Save row */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={downloadPdf}
              disabled={pdfBusy || shapes.length === 0}
              className="w-full gap-1.5"
            >
              {pdfBusy
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileDown className="h-3.5 w-3.5" />}
              Save as PDF
            </Button>

            {lockedClientId ? (
              <Button
                onClick={saveLocked}
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
              <div className="relative">
                <Button
                  onClick={() => setSaveMenuOpen((o) => !o)}
                  disabled={saving || shapes.length === 0}
                  className="w-full gap-1.5"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                >
                  {saving
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Save className="h-3.5 w-3.5" />}
                  Save Measurement
                  <ChevronDown className="h-3 w-3 ml-auto opacity-80" />
                </Button>
                {saveMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border bg-popover shadow-xl ring-1 ring-foreground/10 p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveMenuOpen(false);
                        setShowClientPicker(true);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
                    >
                      <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">Save to existing client</span>
                        <span className="block text-[11px] text-muted-foreground">
                          Links to that client&apos;s record + auto-applies in proposals.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={saveStandalone}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
                    >
                      <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">Save standalone</span>
                        <span className="block text-[11px] text-muted-foreground">
                          For prospect quotes — convert to a client later.
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Client-picker modal-lite for "Save to existing client" path */}
            {showClientPicker && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-xs font-semibold">Pick the client to save to</p>
                <ClientCombobox
                  value={selectedClientId}
                  onChange={(id, c) => {
                    setSelectedClientId(id);
                    setSelectedClient(c);
                  }}
                  placeholder="Search clients…"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowClientPicker(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowClientPicker(false);
                      void saveToPickedClient();
                    }}
                    disabled={!selectedClientId}
                    className="flex-1"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    Save to client
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
