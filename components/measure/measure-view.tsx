'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ShapeList } from './shape-list';
import { AreaSummary } from './area-summary';
import { InstructionsBanner } from './instructions-banner';
import { AddressSearch } from './address-search';
import {
  CreateCustomerFromMeasurement, type PrefilledAddress,
} from './create-customer-from-measurement';
import { Button } from '@/components/ui/button';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import {
  geocodeAddress, geocodeAddressDetailed, type PlaceSuggestion,
} from '@/lib/mapbox';
import { totalsByType, type MeasuredShape } from '@/lib/measurement';
import { staticMapUrlForShapes } from '@/lib/measurement-static-map';
import { toast } from 'sonner';
import {
  ChevronLeft, Loader2, Save, FileDown, ChevronDown, MapPin, User,
  Globe, UserPlus, FilePlus,
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

const HISTORY_LIMIT = 50;

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

type AddressInfo = {
  service_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
} | null;

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
  const [shapes, setShapesRaw] = useState<MeasuredShape[]>(() => {
    if (!initial) return [];
    if (Array.isArray(initial.shapes)) return initial.shapes as MeasuredShape[];
    return [];
  });

  // Undo stack — snapshots of `shapes` *before* each change.
  const historyRef = useRef<MeasuredShape[][]>([]);
  const [historyTick, setHistoryTick] = useState(0); // bumps so canUndo re-evaluates
  const syncShapesRef = useRef<(() => void) | null>(null);
  const focusShapeRef = useRef<((id: string) => void) | null>(null);

  function setShapes(next: MeasuredShape[] | ((prev: MeasuredShape[]) => MeasuredShape[])) {
    setShapesRaw((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: MeasuredShape[]) => MeasuredShape[])(prev) : next;
      // Snapshot the previous state into history.
      historyRef.current = [...historyRef.current, prev].slice(-HISTORY_LIMIT);
      setHistoryTick((t) => t + 1);
      return resolved;
    });
  }

  function undo() {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setShapesRaw(prev);
    setHistoryTick((t) => t + 1);
    // Push restored state back into the Mapbox Draw layer on the next tick
    // so it's mounted before we sync.
    requestAnimationFrame(() => syncShapesRef.current?.());
  }

  // Address state — source of truth for the status badge + create-customer.
  const [searching, setSearching] = useState(!!initialAddress);
  const [addressInfo, setAddressInfo] = useState<AddressInfo>(null);

  // Standalone-only client picking
  const [selectedClientId, setSelectedClientId] = useState<string>(lockedClientId ?? '');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  /** When true, the user just typed an address — defaults Save → "Create New". */
  const [lastEntryWasAddress, setLastEntryWasAddress] = useState(false);

  // Save / PDF / sheet state
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [createIntent, setCreateIntent] = useState<'measurement' | 'proposal'>('measurement');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [savedMeasurementId, setSavedMeasurementId] = useState<string | null>(initial?.id ?? null);

  // Resolve initialAddress on mount if provided.
  useEffect(() => {
    if (!initialAddress) return;
    let cancelled = false;
    (async () => {
      setSearching(true);
      const detailed = await geocodeAddressDetailed(initialAddress);
      if (cancelled) return;
      if (detailed) {
        setCenter({ lng: detailed.lng, lat: detailed.lat });
        setAddressInfo({
          service_address: detailed.placeName,
          city: detailed.city,
          state: detailed.state,
          zip: detailed.zip,
          lat: detailed.lat,
          lng: detailed.lng,
        });
      } else {
        // Fall back to plain coords
        const coords = await geocodeAddress(initialAddress);
        if (cancelled) return;
        if (coords) setCenter({ lng: coords[0], lat: coords[1] });
      }
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [initialAddress]);

  // Keyboard shortcut: Ctrl+Z / Cmd+Z = undo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key === 'z' || e.key === 'Z') {
        // Only fire when nothing else has focus that wants Ctrl+Z (input/textarea).
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totals = useMemo(() => totalsByType(shapes), [shapes]);

  function updateShape(id: string, patch: Partial<MeasuredShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    // The Draw layer holds its own copy; keep them in sync.
    requestAnimationFrame(() => syncShapesRef.current?.());
  }
  function reorderShapes(next: MeasuredShape[]) {
    setShapes(next);
  }
  function focusShape(id: string) {
    focusShapeRef.current?.(id);
  }

  function handleAddress(place: PlaceSuggestion) {
    setCenter({ lng: place.lng, lat: place.lat });
    setAddressInfo({
      service_address: place.placeName,
      city: place.city,
      state: place.state,
      zip: place.zip,
      lat: place.lat,
      lng: place.lng,
    });
    setLastEntryWasAddress(true);
    // If we'd previously picked a client, clear that signal — the user
    // restarted at an address.
    setSelectedClientId('');
    setSelectedClient(null);
  }

  function handlePickClient(id: string, c: Client) {
    setSelectedClientId(id);
    setSelectedClient(c);
    setLastEntryWasAddress(false);
    const composed = [c.service_address, c.service_city, c.service_state, c.service_zip]
      .filter(Boolean).join(', ');
    setAddressInfo({
      service_address: c.service_address,
      city: c.service_city ?? null,
      state: c.service_state ?? null,
      zip: c.service_zip ?? null,
      lat: null,
      lng: null,
    });
    if (composed) {
      void geocodeAddress(composed).then((coords) => {
        if (coords) setCenter({ lng: coords[0], lat: coords[1] });
      });
    }
  }

  // ── Persistence helpers ────────────────────────────────────────────────
  async function persistMeasurement(targetClientId: string | null): Promise<string | null> {
    setSaving(true);
    const { data: measurement, error } = await supabase
      .from('property_measurements')
      .insert({
        company_id: companyId,
        client_id: targetClientId,
        measured_by: userId,
        total_turf_sqft: totals.turf,
        total_hardscape_sqft: totals.hardscape,
        total_bed_sqft: totals.bed,
        total_other_sqft: totals.other,
        shapes,
      })
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
    setSavedMeasurementId(measurement.id);
    return measurement.id;
  }

  async function saveLocked() {
    if (!lockedClientId) return;
    if (shapes.length === 0) { toast.error('Draw at least one shape before saving.'); return; }
    const id = await persistMeasurement(lockedClientId);
    if (!id) return;
    toast.success(`Measurement saved — ${totals.turf.toLocaleString()} sq ft of turf.`);
    router.push(backHref);
    router.refresh();
  }

  async function saveToPickedClient() {
    if (!selectedClientId) { toast.error('Pick a client first.'); return; }
    if (shapes.length === 0) { toast.error('Draw at least one shape before saving.'); return; }
    setSaveMenuOpen(false);
    setShowClientPicker(false);
    const id = await persistMeasurement(selectedClientId);
    if (!id) return;
    toast.success(`Measurement saved to ${selectedClient?.name ?? 'client'}.`);
    router.push(`/dashboard/clients/${selectedClientId}`);
    router.refresh();
  }

  async function saveStandalone() {
    if (shapes.length === 0) { toast.error('Draw at least one shape before saving.'); return; }
    setSaveMenuOpen(false);
    const id = await persistMeasurement(null);
    if (!id) return;
    toast.success('Measurement saved (standalone — no client linked).');
    router.refresh();
  }

  async function downloadPdf() {
    if (shapes.length === 0) { toast.error('Draw at least one shape first.'); return; }
    setPdfBusy(true);
    try {
      const [{ pdf }, { MeasurementDocument }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/measurement-pdf'),
        import('react'),
      ]);
      const staticMapUrl = staticMapUrlForShapes(shapes, center);
      const clientName = lockedClientName ?? selectedClient?.name ?? null;
      const doc = React.default.createElement(MeasurementDocument, {
        shapes,
        address: addressInfo?.service_address ?? null,
        clientName,
        staticMapUrl,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().split('T')[0];
      const slug = (clientName ?? addressInfo?.service_address ?? 'property')
        .replace(/[^a-z0-9-]+/gi, '_').slice(0, 40);
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

  // ── Generate Proposal ──────────────────────────────────────────────────
  async function generateProposal() {
    if (shapes.length === 0) { toast.error('Draw at least one shape first.'); return; }

    // Resolve target client — locked > selected. If neither, prompt to create new.
    const clientId = lockedClientId ?? selectedClientId ?? null;
    if (!clientId) {
      // Open the create-customer sheet pre-set to redirect into the proposal
      // builder once the customer + measurement land.
      setCreateIntent('proposal');
      setShowCreateCustomer(true);
      return;
    }

    // Save the measurement first (if it isn't already).
    let measId = savedMeasurementId;
    if (!measId) {
      measId = await persistMeasurement(clientId);
      if (!measId) return;
    }
    router.push(`/dashboard/proposals/new?client_id=${clientId}&measurement_id=${measId}`);
  }

  // ── Clear All ─────────────────────────────────────────────────────────
  async function doClearAll() {
    setShapes([]);
    requestAnimationFrame(() => syncShapesRef.current?.());
    setSavedMeasurementId(null);
    toast.success('All measurements cleared.');
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const linkedName = lockedClientName ?? selectedClient?.name ?? null;
  const badgeAddress = addressInfo?.service_address ?? null;
  const canUndo = historyRef.current.length > 0;
  void historyTick; // dependency-bumped for canUndo

  // Default Save action depends on context.
  const defaultSaveAction: 'existing' | 'new' | 'standalone' = lockedClientId
    ? 'existing'
    : selectedClientId
      ? 'existing'
      : lastEntryWasAddress
        ? 'new'
        : 'standalone';

  const prefilledAddress: PrefilledAddress = {
    service_address: addressInfo?.service_address ?? '',
    service_city: addressInfo?.city ?? null,
    service_state: addressInfo?.state ?? null,
    service_zip: addressInfo?.zip ?? null,
    lat: addressInfo?.lat ?? null,
    lng: addressInfo?.lng ?? null,
  };

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex flex-col overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* HOW TO MEASURE — first thing on the page so first-time users see it. */}
      <InstructionsBanner />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* MAP COLUMN */}
        <div className="flex-1 relative min-h-[300px] flex flex-col">
          {/* Top bar — primary address search only. */}
          {!lockedClientId && (
            <div className="border-b bg-background p-3 space-y-2.5 shrink-0">
              <AddressSearch
                onAddress={handleAddress}
                autoFocus
                initialValue={initialAddress ?? ''}
              />
              {/* Status badge */}
              {badgeAddress && (
                <div className="inline-flex items-center gap-1.5 text-[11px] rounded-full bg-muted px-2.5 py-1">
                  <MapPin className="h-3 w-3" style={{ color: 'var(--orange)' }} />
                  <span className="font-medium truncate max-w-[280px]">
                    Measuring: {badgeAddress}
                  </span>
                  <span className="text-muted-foreground">
                    {linkedName ? `· Linked to ${linkedName}` : '· No customer linked'}
                  </span>
                </div>
              )}
            </div>
          )}

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
              syncShapesRef={syncShapesRef}
              onUndo={undo}
              canUndo={canUndo}
              onClearAll={() => setConfirmClearAll(true)}
            />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="md:w-[360px] shrink-0 border-l bg-background overflow-y-auto">
          <div className="p-4 space-y-4">
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
              {linkedName && (
                <p className="text-xs text-muted-foreground mt-0.5">{linkedName}</p>
              )}
            </div>

            {/* Or-pick-a-client — small inline picker for the existing-client path. */}
            {standalone && !lockedClientId && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                    or pick a client
                  </span>
                  <span className="flex-1 h-px bg-border" />
                </div>
                <ClientCombobox
                  value={selectedClientId}
                  onChange={(id, c) => handlePickClient(id, c)}
                  placeholder="Pick existing client…"
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

          {/* Action buttons */}
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
                  <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg border bg-popover shadow-xl ring-1 ring-foreground/10 p-1.5">
                    <SaveOption
                      icon={<User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                      title="Save to existing customer"
                      desc="Links to an existing client record."
                      highlighted={defaultSaveAction === 'existing'}
                      onClick={() => {
                        setSaveMenuOpen(false);
                        setShowClientPicker(true);
                      }}
                    />
                    <SaveOption
                      icon={<UserPlus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                      title="Create new customer from this"
                      desc="Address + lot size auto-filled. Status starts as Prospect."
                      highlighted={defaultSaveAction === 'new'}
                      onClick={() => {
                        if (!addressInfo?.service_address) {
                          toast.error('Search an address first so we can pre-fill it.');
                          return;
                        }
                        setSaveMenuOpen(false);
                        setCreateIntent('measurement');
                        setShowCreateCustomer(true);
                      }}
                    />
                    <SaveOption
                      icon={<Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                      title="Save standalone"
                      desc="No customer yet — convert later from the standalone list."
                      highlighted={defaultSaveAction === 'standalone'}
                      onClick={saveStandalone}
                    />
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={generateProposal}
              disabled={shapes.length === 0 || saving}
              className="w-full gap-1.5 font-semibold"
              style={{
                backgroundColor: 'var(--orange-soft)',
                color: 'var(--orange-deep)',
                border: '2px solid var(--orange)',
              }}
            >
              <FilePlus className="h-3.5 w-3.5" />
              Generate Proposal from This Measurement
            </Button>

            {/* Inline client picker for "Save to existing customer" path */}
            {showClientPicker && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-xs font-semibold">Pick the customer to save to</p>
                <ClientCombobox
                  value={selectedClientId}
                  onChange={(id, c) => handlePickClient(id, c)}
                  placeholder="Search clients…"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setShowClientPicker(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveToPickedClient()}
                    disabled={!selectedClientId}
                    className="flex-1"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    Save to customer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
      </div>

      {/* Create-customer sheet */}
      <CreateCustomerFromMeasurement
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        companyId={companyId}
        userId={userId}
        prefilledAddress={prefilledAddress}
        shapes={shapes}
        totalTurfSqft={totals.turf}
        totalHardscapeSqft={totals.hardscape}
        totalBedSqft={totals.bed}
        totalOtherSqft={totals.other}
        redirectTo={createIntent === 'proposal' ? 'proposal' : 'client'}
      />

      {/* Clear-all confirm */}
      <ConfirmDialog
        open={confirmClearAll}
        onOpenChange={setConfirmClearAll}
        title="Clear all measurements?"
        description="Wipes every shape from the map and panel. This cannot be undone."
        confirmLabel="Clear All"
        destructive
        onConfirm={doClearAll}
      />
    </div>
  );
}

function SaveOption({
  icon, title, desc, highlighted, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ' +
        (highlighted
          ? 'bg-[var(--orange-soft)]'
          : 'hover:bg-accent/60')
      }
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span
          className="block text-sm font-semibold"
          style={highlighted ? { color: 'var(--orange-deep)' } : undefined}
        >
          {title}
        </span>
        <span className="block text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
