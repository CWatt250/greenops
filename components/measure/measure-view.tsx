'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ShapeList } from './shape-list';
import { AreaSummary } from './area-summary';
import { InstructionsBanner } from './instructions-banner';
import { MeasurementBottomSheet } from './measurement-bottom-sheet';
import { AddressSearch } from './address-search';
import {
  CreateCustomerFromMeasurement, type PrefilledAddress,
} from './create-customer-from-measurement';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  Globe, UserPlus, FilePlus, Send,
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
  /** Pre-select a client when arriving from a deep link (e.g., crew job
   *  detail's "Measure" button passes the job's client_id). */
  initialClientId?: string | null;
  initial?: PropertyMeasurement | null;
  backHref?: string;
  /** When true, shows the standalone "client picker / save standalone" UI. */
  standalone?: boolean;
  /** Caller's role. Crew sees a "Send to office" outcome instead of
   *  "Generate Proposal" (they can't set pricing). */
  role?: 'owner' | 'dispatcher' | 'crew' | 'customer';
  /** When set to 'client_form', shows a "Use This Measurement" CTA that
   *  writes the total sq ft to localStorage and navigates back. */
  returnTo?: string;
  returnClientId?: string;
  returnClientName?: string;
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
  initialClientId = null,
  initial,
  backHref = '/dashboard',
  standalone = false,
  role = 'owner',
  returnTo,
  returnClientId,
  returnClientName,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isCrew = role === 'crew';

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
  const [selectedClientId, setSelectedClientId] = useState<string>(
    lockedClientId ?? initialClientId ?? '',
  );
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
  // Crew "Send to office" flow state
  const [fieldNote, setFieldNote] = useState('');
  const [submittingToOffice, setSubmittingToOffice] = useState(false);
  const [submittedToOffice, setSubmittedToOffice] = useState(false);

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
      const [{ pdf }, { MeasurementDocument }, { fetchOwnCompany, FALLBACK_COMPANY }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/measurement-pdf'),
        import('@/lib/company-client'),
        import('react'),
      ]);
      const staticMapUrl = staticMapUrlForShapes(shapes, center);
      const clientName = lockedClientName ?? selectedClient?.name ?? null;
      const company = (await fetchOwnCompany()) ?? FALLBACK_COMPANY;
      const doc = React.default.createElement(MeasurementDocument, {
        shapes,
        address: addressInfo?.service_address ?? null,
        clientName,
        staticMapUrl,
        company,
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

  // ── Crew: Send to office for quote ─────────────────────────────────────
  // Saves the measurement (linked to current client if known, otherwise
  // standalone), stamps it with field-suggestion fields, and pings every
  // owner/dispatcher with an in-app notification so the office can pick
  // it up and turn it into a real proposal.
  async function submitToOffice() {
    if (shapes.length === 0) {
      toast.error('Draw at least one shape first.');
      return;
    }
    setSubmittingToOffice(true);
    try {
      const targetClientId = lockedClientId ?? selectedClientId ?? null;
      let measId = savedMeasurementId;
      if (!measId) {
        measId = await persistMeasurement(targetClientId);
        if (!measId) return;
      }
      const { error: updateErr } = await supabase
        .from('property_measurements')
        .update({
          status: 'submitted',
          field_note: fieldNote.trim() || null,
          submitted_by_profile_id: userId,
          submitted_to_office_at: new Date().toISOString(),
        })
        .eq('id', measId);
      if (updateErr) {
        toast.error(updateErr.message);
        return;
      }
      // Notify dispatchers + owners.
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .in('role', ['owner', 'dispatcher']);
      const address = addressInfo?.service_address ?? lockedClientName ?? 'Field measurement';
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a: { id: string }) => ({
            company_id: companyId,
            profile_id: a.id,
            title: `Field measurement from ${address}`,
            body: fieldNote.trim() || 'Crew suggests a quote — review the measurement to follow up.',
            entity_type: 'property_measurement',
            entity_id: measId,
          })),
        );
      }
      setSubmittedToOffice(true);
      toast.success('Sent to office. Dispatch will follow up with a quote.');
    } finally {
      setSubmittingToOffice(false);
    }
  }

  // ── Return to client form with measurement total ───────────────────────
  async function useThisMeasurement() {
    if (shapes.length === 0) {
      toast.error('Draw at least one shape before using the measurement.');
      return;
    }
    setSaving(true);
    try {
      // Persist to DB if we have a real (non-"new") client ID
      if (returnClientId && returnClientId !== 'new') {
        await persistMeasurement(returnClientId);
      }
      // Store the total so the client form can pick it up on mount
      localStorage.setItem(
        'client_form_pending_measurement',
        JSON.stringify({ sqft: Math.round(totals.total) })
      );
      const dest =
        returnClientId && returnClientId !== 'new'
          ? `/dashboard/clients/${returnClientId}/edit`
          : '/dashboard/clients/new';
      router.push(dest);
    } finally {
      setSaving(false);
    }
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
      className="-m-4 md:-m-6 lg:-m-8 flex flex-col overflow-hidden max-w-[100vw]"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* Return-to-client-form banner */}
      {returnTo === 'client_form' && (
        <div
          className="shrink-0 flex items-start gap-2.5 px-4 py-2.5 text-sm border-b"
          style={{
            backgroundColor: 'var(--orange-soft)',
            borderColor: 'var(--orange)',
            color: 'var(--orange-deep)',
          }}
        >
          <span className="text-base leading-none mt-0.5">📐</span>
          <span>
            <strong>
              Measuring lot size{returnClientName ? ` for ${returnClientName}` : ''}
            </strong>
            {' '}— draw the property outline, then tap{' '}
            <strong>&ldquo;Use This Measurement&rdquo;</strong> to return.
          </span>
        </div>
      )}

      {/* Instructions — desktop only, hidden on mobile */}
      <div className="hidden md:block">
        <InstructionsBanner />
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0">
        {/* MAP COLUMN */}
        <div className="flex-1 relative min-h-[300px] flex flex-col min-w-0">
          {/* Top bar — primary address search only */}
          {!lockedClientId && (
            <div className="border-b bg-background p-3 space-y-2.5 shrink-0 min-w-0 w-full">
              <AddressSearch
                onAddress={handleAddress}
                autoFocus
                initialValue={initialAddress ?? ''}
              />
              {/* Status badge — caps at the available width so long addresses
                  never push the page past the viewport on iPhone. */}
              {badgeAddress && (
                <div className="flex items-center gap-1.5 text-[11px] rounded-full bg-muted px-2.5 py-1 max-w-full min-w-0 w-fit">
                  <MapPin className="h-3 w-3 shrink-0" style={{ color: 'var(--orange)' }} />
                  <span className="font-medium truncate min-w-0">
                    Measuring: {badgeAddress}
                  </span>
                  <span className="text-muted-foreground shrink-0 hidden sm:inline">
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
              mobileCta={returnTo === 'client_form' ? (
                <Button
                  onClick={() => void useThisMeasurement()}
                  disabled={saving || shapes.length === 0}
                  className="w-full gap-1.5 h-11 text-sm font-semibold shadow-lg"
                  style={shapes.length > 0
                    ? { backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }
                    : undefined}
                  variant={shapes.length > 0 ? undefined : 'secondary'}
                >
                  {saving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : shapes.length > 0 ? '✅' : '←'}
                  {shapes.length > 0
                    ? `Use This Measurement (${Math.round(totals.total).toLocaleString()} sq ft)`
                    : 'Draw the lot outline first'}
                </Button>
              ) : undefined}
            />
          </div>
        </div>

        {/* RIGHT PANEL — desktop only */}
        <aside className="hidden md:block md:w-[360px] shrink-0 border-l bg-background overflow-y-auto">
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
            {returnTo === 'client_form' && (
              <Button
                onClick={() => void useThisMeasurement()}
                disabled={saving || shapes.length === 0}
                className="w-full gap-1.5 font-semibold"
                style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
              >
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : '✅'}
                {shapes.length > 0
                  ? `Use This Measurement (${Math.round(totals.total).toLocaleString()} sq ft)`
                  : 'Use This Measurement'}
              </Button>
            )}
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

            {/* Owner/dispatcher: jump to the proposal builder. Crew:
             *  capture a field note + send to office for follow-up. */}
            {!isCrew ? (
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
            ) : submittedToOffice ? (
              <div
                className="rounded-lg border px-3 py-2.5 text-xs"
                style={{
                  backgroundColor: 'var(--orange-soft)',
                  borderColor: 'var(--orange)',
                  color: 'var(--orange-deep)',
                }}
              >
                <p className="font-bold">✅ Sent to office</p>
                <p className="mt-0.5">Dispatch will follow up with a quote.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="field-note" className="text-xs">
                  Note for the office (optional)
                </Label>
                <textarea
                  id="field-note"
                  value={fieldNote}
                  onChange={(e) => setFieldNote(e.target.value)}
                  rows={3}
                  placeholder="e.g., Customer asked about adding aeration; back yard not in original quote."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  onClick={submitToOffice}
                  disabled={shapes.length === 0 || submittingToOffice || saving}
                  className="w-full gap-1.5 font-semibold text-white"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  {submittingToOffice
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Send to office for quote
                </Button>
              </div>
            )}

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

      {/* ── MOBILE BOTTOM SHEET (hidden on desktop) ── */}
      <div className="md:hidden">
        <MeasurementBottomSheet
          peek={
            shapes.length > 0 ? (
              <div className="flex items-center justify-between text-xs">
                <span>📐 {shapes.length} shape{shapes.length === 1 ? '' : 's'}</span>
                <span className="font-mono tabular-nums">
                  {(
                    totals.turf + totals.hardscape + totals.bed + totals.other
                  ).toLocaleString()} sq ft
                </span>
                <span className="text-muted-foreground">Tap to label &amp; save</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Draw shapes to see measurements
              </p>
            )
          }
          detail={
            <div className="space-y-4 pb-4">
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

              {/* Action buttons — compact for mobile */}
              <div className="flex flex-col gap-2">
                {returnTo === 'client_form' && (
                  <Button
                    onClick={() => void useThisMeasurement()}
                    disabled={saving || shapes.length === 0}
                    className="w-full gap-1.5 text-xs h-10 font-semibold"
                    style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
                  >
                    {saving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : '✅'}
                    {shapes.length > 0
                      ? `Use This Measurement (${Math.round(totals.total).toLocaleString()} sq ft)`
                      : 'Use This Measurement'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  disabled={pdfBusy || shapes.length === 0}
                  className="w-full gap-1.5 text-xs h-9"
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
                    className="w-full gap-1.5 text-xs h-9"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    {saving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Save Measurement
                  </Button>
                ) : (
                  <>
                    {/* Save to existing customer (quick action) */}
                    {selectedClientId && (
                      <Button
                        onClick={() => void saveToPickedClient()}
                        disabled={saving || shapes.length === 0}
                        className="w-full gap-1.5 text-xs h-9"
                        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                      >
                        {saving
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5" />}
                        Save to {selectedClient?.name ?? 'customer'}
                      </Button>
                    )}

                    {/* Save menu toggle */}
                    <Button
                      onClick={() => setSaveMenuOpen((o) => !o)}
                      disabled={saving || shapes.length === 0}
                      variant="outline"
                      className="w-full gap-1.5 text-xs h-9"
                    >
                      <Save className="h-3.5 w-3.5" />
                      More save options…
                    </Button>
                    {saveMenuOpen && (
                      <div className="rounded-lg border bg-popover shadow-xl p-1.5 space-y-1">
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
                          title="Create new customer"
                          desc="Auto-fills address + lot size."
                          highlighted={defaultSaveAction === 'new'}
                          onClick={() => {
                            if (!addressInfo?.service_address) {
                              toast.error('Search an address first.');
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
                          desc="No customer yet."
                          highlighted={defaultSaveAction === 'standalone'}
                          onClick={saveStandalone}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Crew: send to office */}
                {isCrew ? (
                  submittedToOffice ? (
                    <div
                      className="rounded-lg border px-3 py-2.5 text-xs"
                      style={{
                        backgroundColor: 'var(--orange-soft)',
                        borderColor: 'var(--orange)',
                        color: 'var(--orange-deep)',
                      }}
                    >
                      <p className="font-bold">✅ Sent to office</p>
                      <p className="mt-0.5">Dispatch will follow up with a quote.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        id="field-note-mobile"
                        value={fieldNote}
                        onChange={(e) => setFieldNote(e.target.value)}
                        rows={2}
                        placeholder="Note for the office…"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        onClick={submitToOffice}
                        disabled={shapes.length === 0 || submittingToOffice || saving}
                        className="w-full gap-1.5 text-xs h-9 text-white"
                        style={{ backgroundColor: 'var(--orange)' }}
                      >
                        {submittingToOffice
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5" />}
                        Send to office for quote
                      </Button>
                    </div>
                  )
                ) : (
                  <Button
                    onClick={generateProposal}
                    disabled={shapes.length === 0 || saving}
                    className="w-full gap-1.5 text-xs h-9 font-semibold"
                    style={{
                      backgroundColor: 'var(--orange-soft)',
                      color: 'var(--orange-deep)',
                      border: '2px solid var(--orange)',
                    }}
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                    Generate Proposal
                  </Button>
                )}

                {/* Inline client picker for "Save to existing" */}
                {showClientPicker && (
                  <div className="rounded-lg border bg-card p-3 space-y-2">
                    <p className="text-xs font-semibold">Pick the customer to save to</p>
                    <ClientCombobox
                      value={selectedClientId}
                      onChange={(id, c) => handlePickClient(id, c)}
                      placeholder="Search clients…"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowClientPicker(false)} className="flex-1">Cancel</Button>
                      <Button size="sm" onClick={() => void saveToPickedClient()} disabled={!selectedClientId} className="flex-1" style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>Save</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          hasShapes={shapes.length > 0}
        />
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
