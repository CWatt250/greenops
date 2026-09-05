'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { localDateStr } from '@/lib/dates';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { MeasurementBanner } from '@/components/proposals/measurement-banner';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Save, Send, Loader2, Sparkles,
  Check, MapPin, Phone, Mail, UserPlus, User as UserIcon, FileText,
  Calendar as CalendarIcon, X,
} from 'lucide-react';
import {
  FREQUENCY_LABELS, FREQUENCY_DISCOUNT_PCT, FREQUENCY_VISITS_PER_YEAR,
  laborMultiplier, laborMultiplierBreakdown, lineTotal, annualValue, monthlyRecurring, perVisitSubtotal,
  suggestedMonthlyRate, profitMargin, marginColor,
  type LineItemDraft, type PricingFlags,
} from '@/lib/proposal-pricing';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { AddressSearch } from '@/components/measure/address-search';
import type { PlaceSuggestion } from '@/lib/mapbox';
import type {
  Client, Service, LineItemFrequency, PropertyComplexity, BillingMode,
  ClientStatus, PropertyType,
} from '@/types';

interface Props {
  companyId: string;
  userId: string;
  services: Service[];
  initialClientId?: string;
  /** When set, the wizard prefetches the measurement and pre-applies it. */
  initialMeasurementId?: string;
  /** Default 1; pass 2 when the wizard should skip Step 1 (client already set). */
  initialStep?: 1 | 2 | 3;
}

interface DraftLineItem extends LineItemDraft {
  _key: string;
}

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function defaultDescription(svc: Service): string {
  return svc.description || svc.name;
}

function lineFromService(svc: Service): DraftLineItem {
  return {
    _key: makeKey(),
    service_id: svc.id,
    description: defaultDescription(svc),
    quantity: 1,
    unit_price: Number(svc.base_price ?? 0),
    markup_pct: 20,
    discount_pct: 0,
    frequency: 'one_time',
    frequency_discount_pct: 0,
    billing_mode: 'per_visit',
    monthly_rate: 0,
    unit: svc.unit?.replace('_', ' ') ?? null,
    notes: null,
  };
}

function lineFromCustom(): DraftLineItem {
  return {
    _key: makeKey(),
    service_id: null,
    description: '',
    quantity: 1,
    unit_price: 0,
    markup_pct: 20,
    discount_pct: 0,
    frequency: 'one_time',
    frequency_discount_pct: 0,
    billing_mode: 'per_visit',
    monthly_rate: 0,
    unit: 'each',
    notes: null,
  };
}

function pickByCategory(services: Service[], cats: string[]): Service[] {
  return services.filter((s) => cats.includes(s.category));
}

export function ProposalWizard({
  companyId, userId, services, initialClientId, initialMeasurementId,
  initialStep = 1,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [clientId, setClientId] = useState<string>(initialClientId ?? '');
  const [client, setClient] = useState<Client | null>(null);

  // Step-1 path picker. Default to "new prospect" — most proposals are for
  // people who don't exist as customers yet.
  type Step1Path = 'new' | 'existing' | 'full';
  const [step1Path, setStep1Path] = useState<Step1Path>('new');

  // Path A — quick prospect inline form
  const [prospectName, setProspectName] = useState('');
  const [prospectAddress, setProspectAddress] = useState('');
  const [prospectAddressInfo, setProspectAddressInfo] = useState<{
    city: string | null; state: string | null; zip: string | null;
  } | null>(null);
  const [prospectPhone, setProspectPhone] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');

  // Path C — full customer record sheet
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [fullCompanyName, setFullCompanyName] = useState('');
  const [fullPhone, setFullPhone] = useState('');
  const [fullEmail, setFullEmail] = useState('');
  const [fullPropertyType, setFullPropertyType] = useState<PropertyType>('residential');
  const [fullPreferredContact, setFullPreferredContact] = useState<'phone' | 'email' | 'sms'>('phone');
  const [fullAddress, setFullAddress] = useState('');
  const [fullAddressInfo, setFullAddressInfo] = useState<{
    city: string | null; state: string | null; zip: string | null;
  } | null>(null);
  const [fullNotes, setFullNotes] = useState('');

  const [creatingClient, setCreatingClient] = useState(false);

  const [measurementTurfSqft, setMeasurementTurfSqft] = useState<number>(0);
  const [measurementHardscapeSqft, setMeasurementHardscapeSqft] = useState<number>(0);
  const [measurementBedSqft, setMeasurementBedSqft] = useState<number>(0);
  const [measurementOtherSqft, setMeasurementOtherSqft] = useState<number>(0);
  const [measurementId, setMeasurementId] = useState<string | null>(initialMeasurementId ?? null);
  const measurementAppliedRef = useRef(false);
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return localDateStr(d);
  });
  const [taxRate, setTaxRate] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftLineItem[]>([]);
  const [flags, setFlags] = useState<PricingFlags>({
    property_complexity: 'simple',
    has_slopes: false,
    has_dogs: false,
    has_obstacles: false,
  });
  const [saving, setSaving] = useState<null | 'draft' | 'send'>(null);
  const [propertyOpen, setPropertyOpen] = useState(false);

  // Per-visit subtotal excludes per_month lines. Tax applies here.
  const subtotal = useMemo(() => perVisitSubtotal(items, flags), [items, flags]);
  // Monthly recurring is the sum of per_month line totals.
  const monthlyTotal = useMemo(() => monthlyRecurring(items, flags), [items, flags]);
  // taxRate state is in percent for the input UI (e.g., 8.5 = 8.5%).
  // The DB stores decimal — see migration 031. We divide by 100 at insert
  // time and at compute time.
  const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);
  const grandTotal = subtotal + taxAmount;
  const annual = useMemo(() => annualValue(items, flags), [items, flags]);
  const margin = useMemo(() => profitMargin(items, flags), [items, flags]);
  const marginTone = marginColor(margin);

  // Resolve which measurement (if any) backs this proposal: explicit URL
  // param > client.primary_measurement_id. Pull totals so the banner +
  // smart-suggestions can use them.
  useEffect(() => {
    const measId = initialMeasurementId
      ?? (client as Client & { primary_measurement_id?: string | null } | null)?.primary_measurement_id
      ?? null;
    if (!measId) {
      setMeasurementTurfSqft(0);
      setMeasurementHardscapeSqft(0);
      setMeasurementBedSqft(0);
      setMeasurementOtherSqft(0);
      setMeasurementId(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('property_measurements')
      .select('id, total_turf_sqft, total_hardscape_sqft, total_bed_sqft, total_other_sqft')
      .eq('id', measId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMeasurementId(data.id as string);
        setMeasurementTurfSqft(Number(data.total_turf_sqft ?? 0));
        setMeasurementHardscapeSqft(Number(data.total_hardscape_sqft ?? 0));
        setMeasurementBedSqft(Number(data.total_bed_sqft ?? 0));
        setMeasurementOtherSqft(Number(data.total_other_sqft ?? 0));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, initialMeasurementId]);

  // Count per-sqft line items so the banner can show how many would update.
  const perSqftLineCount = useMemo(() => {
    return items.reduce((acc, it) => {
      const svc = services.find((s) => s.id === it.service_id);
      return acc + (svc?.unit === 'per_sqft' ? 1 : 0);
    }, 0);
  }, [items, services]);

  function applyMeasurementToLines() {
    setItems((prev) => prev.map((it) => {
      const svc = services.find((s) => s.id === it.service_id);
      if (svc?.unit !== 'per_sqft') return it;
      return { ...it, quantity: measurementTurfSqft };
    }));
    toast.success(`Applied ${measurementTurfSqft.toLocaleString()} sq ft to per-sq-ft services.`);
  }

  // When we landed via /dashboard/proposals/new?client_id=X&measurement_id=Y,
  // pre-populate Step 2 with smart suggestions, then auto-apply the turf
  // sqft to per-sqft lines. Runs once when the data is ready.
  useEffect(() => {
    if (!initialMeasurementId) return;
    if (measurementAppliedRef.current) return;
    if (measurementTurfSqft === 0 && measurementHardscapeSqft === 0
      && measurementBedSqft === 0 && measurementOtherSqft === 0) {
      return; // measurement data hasn't arrived yet
    }
    measurementAppliedRef.current = true;

    void (async () => {
      const { suggestServicesFromMeasurement, PRICING } = await import('@/lib/proposal-helpers');
      const suggestions = suggestServicesFromMeasurement({
        total_turf_sqft: measurementTurfSqft,
        total_hardscape_sqft: measurementHardscapeSqft,
        total_bed_sqft: measurementBedSqft,
        total_other_sqft: measurementOtherSqft,
      });

      // For each suggestion, find a matching service in the catalog by
      // category. If none, skip. (We only seed lines from real services so
      // the totals computation stays consistent with services.unit.)
      const additions: DraftLineItem[] = [];
      for (const sug of suggestions) {
        const svc = services.find((s) => s.category === sug.category && s.is_active);
        if (!svc) continue;
        const useSqftRate = svc.unit === 'per_sqft';
        const unitPrice = useSqftRate
          ? Number((svc as Service & { per_sqft_rate?: number | null }).per_sqft_rate
              ?? sug.defaultRatePerSqft
              ?? svc.base_price ?? 0)
          : Number(svc.base_price ?? 0);
        const quantity = useSqftRate
          ? (sug.defaultQuantity ?? measurementTurfSqft)
          : (sug.defaultQuantity ?? 1);

        const freqDiscount = sug.frequency === 'weekly' ? 15
          : sug.frequency === 'biweekly' ? 10
          : sug.frequency === 'monthly' ? 5
          : 0;

        additions.push({
          _key: makeKey(),
          service_id: svc.id,
          description: sug.label,
          quantity,
          unit_price: unitPrice,
          markup_pct: 20,
          discount_pct: 0,
          frequency: sug.frequency,
          frequency_discount_pct: freqDiscount,
        });
      }

      if (additions.length > 0) {
        setItems((prev) => {
          // Don't double-add if defaults already filled the list.
          if (prev.length > 0) return prev;
          return additions;
        });
        toast.success(
          `Pre-loaded ${additions.length} service${additions.length === 1 ? '' : 's'} from the measurement.`
        );
      }
      // PRICING is referenced indirectly via sug.defaultRatePerSqft; ack to keep tree-shake happy
      void PRICING;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialMeasurementId,
    measurementTurfSqft,
    measurementHardscapeSqft,
    measurementBedSqft,
    measurementOtherSqft,
  ]);

  // Auto-defaults from property type
  useEffect(() => {
    if (!client || items.length > 0) return;
    if (client.property_type === 'residential') {
      const picks = pickByCategory(services, ['mowing', 'edging']);
      if (picks.length > 0) setItems(picks.slice(0, 2).map(lineFromService));
    } else if (client.property_type === 'commercial') {
      const picks = pickByCategory(services, ['mowing', 'fertilization', 'aeration']);
      if (picks.length > 0) setItems(picks.slice(0, 3).map(lineFromService));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Auto-title from client + date
  useEffect(() => {
    if (!client) return;
    if (!title) {
      const d = new Date().toLocaleDateString('en-US', {
        month: 'short', year: 'numeric',
      });
      setTitle(`${client.name} · ${d} Proposal`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  function addService(svc: Service) {
    setItems((prev) => [...prev, lineFromService(svc)]);
  }

  function addPreset(name: 'mowing' | 'spring' | 'full_season') {
    if (name === 'mowing') {
      const picks = pickByCategory(services, ['mowing', 'edging']);
      if (picks.length === 0) {
        toast.error('Add Mowing or Edging services to your catalog first.');
        return;
      }
      setItems((prev) => [
        ...prev,
        ...picks.map((s) => ({ ...lineFromService(s), frequency: 'weekly' as LineItemFrequency, frequency_discount_pct: 15 })),
      ]);
    } else if (name === 'spring') {
      const picks = pickByCategory(services, ['cleanup', 'fertilization', 'aeration']);
      if (picks.length === 0) {
        toast.error('Add Cleanup, Fertilization, or Aeration services first.');
        return;
      }
      setItems((prev) => [...prev, ...picks.map(lineFromService)]);
    } else {
      // Full season: mowing weekly + edging weekly + 4× fertilization + aeration
      const mow = pickByCategory(services, ['mowing']).slice(0, 1);
      const edge = pickByCategory(services, ['edging']).slice(0, 1);
      const fert = pickByCategory(services, ['fertilization']).slice(0, 1);
      const aer = pickByCategory(services, ['aeration']).slice(0, 1);
      const additions: DraftLineItem[] = [];
      [...mow, ...edge].forEach((s) => additions.push({
        ...lineFromService(s),
        frequency: 'weekly',
        frequency_discount_pct: 15,
      }));
      fert.forEach((s) => additions.push({
        ...lineFromService(s),
        quantity: 4,
        frequency: 'seasonal',
      }));
      aer.forEach((s) => additions.push({ ...lineFromService(s), frequency: 'seasonal' }));
      if (additions.length === 0) {
        toast.error('Add Mowing, Edging, Fertilization, or Aeration services first.');
        return;
      }
      setItems((prev) => [...prev, ...additions]);
    }
  }

  function updateItem(key: string, patch: Partial<DraftLineItem>) {
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i._key !== key));
  }

  function setFrequency(key: string, freq: LineItemFrequency) {
    updateItem(key, {
      frequency: freq,
      frequency_discount_pct: FREQUENCY_DISCOUNT_PCT[freq],
    });
  }

  function setBillingMode(key: string, mode: BillingMode) {
    setItems((prev) => prev.map((it) => {
      if (it._key !== key) return it;
      // When switching Per Visit → Per Month for the first time, auto-suggest
      // a monthly rate from the visit math.
      if (mode === 'per_month' && (!it.monthly_rate || it.monthly_rate === 0)) {
        const suggested = suggestedMonthlyRate(it, flags);
        return { ...it, billing_mode: 'per_month', monthly_rate: suggested };
      }
      return { ...it, billing_mode: mode };
    }));
  }

  function addCustomLineItem() {
    setItems((prev) => [...prev, lineFromCustom()]);
  }

  // ── Step 1 handlers ─────────────────────────────────────────────────────
  async function createClientFromForm(payload: {
    name: string;
    address: string;
    addressInfo: { city: string | null; state: string | null; zip: string | null } | null;
    phone?: string;
    email?: string;
    company_name?: string;
    property_type?: PropertyType;
    preferred_contact?: 'phone' | 'email' | 'sms';
    notes?: string;
    status: ClientStatus;
  }): Promise<{ id: string; row: Client } | null> {
    if (!payload.name.trim()) {
      toast.error('Name is required.');
      return null;
    }
    setCreatingClient(true);
    const insertPayload = {
      company_id: companyId,
      name: payload.name.trim(),
      company_name: payload.company_name?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      preferred_contact: payload.preferred_contact ?? 'phone',
      property_type: payload.property_type ?? 'residential',
      service_address: payload.address.trim() || '—',
      service_city: payload.addressInfo?.city ?? null,
      service_state: payload.addressInfo?.state ?? null,
      service_zip: payload.addressInfo?.zip ?? null,
      billing_same_as_service: true,
      access_notes: payload.notes?.trim() || null,
      status: payload.status,
    };
    const { data, error } = await supabase
      .from('clients')
      .insert(insertPayload)
      .select('*')
      .single();
    setCreatingClient(false);

    if (error || !data) {
      toast.error(error?.message ?? 'Failed to create client.');
      return null;
    }
    const newClient = data as Client;
    setClientId(newClient.id);
    setClient(newClient);
    return { id: newClient.id, row: newClient };
  }

  async function handleNewProspect() {
    const created = await createClientFromForm({
      name: prospectName,
      address: prospectAddress,
      addressInfo: prospectAddressInfo,
      phone: prospectPhone,
      email: prospectEmail,
      status: 'prospect',
    });
    if (!created) return;
    toast.success('Prospect added — fill in the rest later.');
    setStep(2);
  }

  async function handleExistingClientContinue() {
    if (!clientId) {
      toast.error('Pick a client first.');
      return;
    }
    setStep(2);
  }

  async function handleFullCustomerSubmit() {
    const created = await createClientFromForm({
      name: fullName,
      company_name: fullCompanyName,
      address: fullAddress,
      addressInfo: fullAddressInfo,
      phone: fullPhone,
      email: fullEmail,
      property_type: fullPropertyType,
      preferred_contact: fullPreferredContact,
      notes: fullNotes,
      status: 'active',
    });
    if (!created) return;
    toast.success(`${created.row.name} added as a customer.`);
    setFullSheetOpen(false);
    setStep(2);
  }

  function handleProspectAddress(place: PlaceSuggestion) {
    setProspectAddress(place.placeName);
    setProspectAddressInfo({ city: place.city, state: place.state, zip: place.zip });
  }

  function handleFullAddress(place: PlaceSuggestion) {
    setFullAddress(place.placeName);
    setFullAddressInfo({ city: place.city, state: place.state, zip: place.zip });
  }

  async function handleSave(targetStatus: 'draft' | 'sent') {
    if (!clientId) { toast.error('Pick a client first.'); return; }
    if (items.length === 0) { toast.error('Add at least one line item.'); return; }

    setSaving(targetStatus === 'sent' ? 'send' : 'draft');

    const { data: estimate, error: estErr } = await supabase
      .from('estimates')
      .insert({
        company_id: companyId,
        client_id: clientId,
        title: title || `Proposal · ${new Date().toLocaleDateString()}`,
        status: targetStatus,
        valid_until: validUntil,
        notes: notes || null,
        tax_rate: taxRate / 100, // store as decimal: 8.5 (UI) → 0.085 (DB)
        property_complexity: flags.property_complexity,
        has_slopes: flags.has_slopes,
        has_dogs: flags.has_dogs,
        has_obstacles: flags.has_obstacles,
        payment_terms: paymentTerms,
        annual_value: annual,
        created_by: userId,
      })
      .select('id')
      .single();

    if (estErr || !estimate) {
      setSaving(null);
      toast.error(estErr?.message ?? 'Failed to save proposal.');
      return;
    }

    const inserts = items.map((it, i) => {
      const isCustom = it.service_id === null;
      const isMonthly = it.billing_mode === 'per_month';
      // For per_month lines, store qty=1 + unit_price=monthly_rate so the
      // computed total column equals the monthly amount; markup/discount
      // already absorbed into monthly_rate via the wizard's UI.
      const qty = isMonthly ? 1 : it.quantity;
      const unitPrice = isMonthly ? Number(it.monthly_rate ?? 0) : it.unit_price;
      const markup = isMonthly ? 0 : it.markup_pct;
      const discount = isMonthly ? 0 : it.discount_pct;
      return {
        estimate_id: estimate.id,
        service_id: it.service_id,
        description: it.description,
        quantity: qty,
        unit_price: unitPrice,
        markup_pct: markup,
        discount_pct: discount,
        frequency: it.frequency,
        frequency_discount_pct: it.frequency_discount_pct,
        billing_mode: it.billing_mode ?? 'per_visit',
        monthly_rate: isMonthly ? Number(it.monthly_rate ?? 0) : null,
        is_custom: isCustom,
        unit: it.unit ?? null,
        notes: it.notes?.trim() || null,
        sort_order: i,
      };
    });

    const { error: linesErr } = await supabase
      .from('estimate_line_items')
      .insert(inserts);

    if (linesErr) {
      setSaving(null);
      toast.error(linesErr.message);
      return;
    }

    setSaving(null);
    toast.success(targetStatus === 'sent' ? 'Proposal sent!' : 'Proposal saved as draft.');
    router.push(`/dashboard/proposals/${estimate.id}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Step indicator — compact label on mobile, full track on sm+ */}
      <p className="sm:hidden text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span className="text-foreground">Step {step} of 3</span>
        {' · '}
        {step === 1 ? 'Client' : step === 2 ? 'Services' : 'Review'}
      </p>
      <ol className="hidden sm:flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                step === s
                  ? 'bg-[var(--orange)] text-white'
                  : step > s
                    ? 'bg-[var(--orange-soft)] text-[var(--orange-deep)]'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </span>
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                step === s ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {s === 1 ? 'Client' : s === 2 ? 'Services' : 'Review'}
            </span>
            {s < 3 && <span className="text-muted-foreground/40 mx-1">—</span>}
          </li>
        ))}
      </ol>

      {/* STEP 1 — three paths */}
      {step === 1 && (
        <div className="space-y-4 max-w-xl">
          <h2 className="text-base font-semibold">Who&rsquo;s this proposal for?</h2>

          {/* Path A — New prospect (default highlighted) */}
          <PathCard
            active={step1Path === 'new'}
            onClick={() => setStep1Path('new')}
            icon={<Sparkles className="h-4 w-4" />}
            title="New prospect — quick entry"
            desc="Just a name + address, no full record"
          >
            {step1Path === 'new' && (
              <div className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prospect-name" className="text-xs">Name *</Label>
                  <Input
                    id="prospect-name"
                    value={prospectName}
                    onChange={(e) => setProspectName(e.target.value)}
                    placeholder="John Smith"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Service address</Label>
                  <AddressSearch
                    onAddress={handleProspectAddress}
                    autoFocus={false}
                    initialValue={prospectAddress}
                    placeholder="1234 Main St, Kennewick"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prospect-phone" className="text-xs">Phone</Label>
                    <Input
                      id="prospect-phone"
                      type="tel"
                      value={prospectPhone}
                      onChange={(e) => setProspectPhone(e.target.value)}
                      placeholder="(509) 555-0100"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prospect-email" className="text-xs">Email</Label>
                    <Input
                      id="prospect-email"
                      type="email"
                      value={prospectEmail}
                      onChange={(e) => setProspectEmail(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleNewProspect}
                    disabled={!prospectName.trim() || creatingClient}
                    className="gap-1.5 h-11"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    {creatingClient
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                    Continue to services
                  </Button>
                </div>
              </div>
            )}
          </PathCard>

          {/* Path B — Existing client */}
          <PathCard
            active={step1Path === 'existing'}
            onClick={() => setStep1Path('existing')}
            icon={<UserIcon className="h-4 w-4" />}
            title="Existing client"
            desc="Pick from your customer list"
          >
            {step1Path === 'existing' && (
              <div className="space-y-3 pt-3">
                <ClientCombobox
                  value={clientId}
                  onChange={(id, c) => {
                    setClientId(id);
                    setClient(c);
                  }}
                  placeholder="Search clients…"
                />
                {client && (
                  <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{client.name}</span>
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)]">
                        {client.property_type}
                      </span>
                    </div>
                    {client.service_address && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {client.service_address}
                      </p>
                    )}
                    {client.phone && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {client.phone}
                      </p>
                    )}
                    {client.email && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3 w-3" /> {client.email}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleExistingClientContinue}
                    disabled={!clientId}
                    className="gap-1.5 h-11"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    Continue <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </PathCard>

          {/* Path C — Full customer record */}
          <PathCard
            active={step1Path === 'full'}
            onClick={() => {
              setStep1Path('full');
              setFullSheetOpen(true);
            }}
            icon={<UserPlus className="h-4 w-4" />}
            title="Create full customer record + proposal"
            desc="Save as customer with all details"
          />
        </div>
      )}

      {/* Slide-out sheet for Path C */}
      <Sheet
        open={fullSheetOpen}
        onOpenChange={(o) => {
          setFullSheetOpen(o);
          if (!o && step1Path === 'full' && !clientId) {
            // User dismissed without saving — fall back to default path.
            setStep1Path('new');
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New customer</SheetTitle>
            <SheetDescription>
              Save as a full customer record. Status starts at <strong>Active</strong>.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full-name" className="text-xs">Name *</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full-company" className="text-xs">Company (optional)</Label>
              <Input
                id="full-company"
                value={fullCompanyName}
                onChange={(e) => setFullCompanyName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service address</Label>
              <AddressSearch
                onAddress={handleFullAddress}
                autoFocus={false}
                initialValue={fullAddress}
                placeholder="1234 Main St, Kennewick"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="full-phone" className="text-xs">Phone</Label>
                <Input
                  id="full-phone"
                  type="tel"
                  value={fullPhone}
                  onChange={(e) => setFullPhone(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="full-email" className="text-xs">Email</Label>
                <Input
                  id="full-email"
                  type="email"
                  value={fullEmail}
                  onChange={(e) => setFullEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Property type</Label>
                <Select
                  value={fullPropertyType}
                  onValueChange={(v) => setFullPropertyType((v ?? 'residential') as PropertyType)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="hoa">HOA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preferred contact</Label>
                <Select
                  value={fullPreferredContact}
                  onValueChange={(v) => setFullPreferredContact((v ?? 'phone') as 'phone' | 'email' | 'sms')}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full-notes" className="text-xs">Notes (optional)</Label>
              <textarea
                id="full-notes"
                value={fullNotes}
                onChange={(e) => setFullNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Gate codes, dogs, special access notes…"
              />
            </div>
            <Button
              onClick={handleFullCustomerSubmit}
              disabled={creatingClient || !fullName.trim()}
              className="w-full gap-1.5 h-11"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {creatingClient
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ChevronRight className="h-3.5 w-3.5" />}
              Save customer + Continue
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* STEP 2 — build services */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          {/* LEFT — service picker */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Quick add
              </p>
              <div className="space-y-1.5">
                <Button
                  variant="outline" size="sm" className="w-full justify-start gap-1.5"
                  onClick={() => addPreset('mowing')}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Mowing Package
                </Button>
                <Button
                  variant="outline" size="sm" className="w-full justify-start gap-1.5"
                  onClick={() => addPreset('spring')}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Spring Cleanup Bundle
                </Button>
                <Button
                  variant="outline" size="sm" className="w-full justify-start gap-1.5"
                  onClick={() => addPreset('full_season')}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Full Season Contract
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Services catalog
                </p>
              </div>
              <div className="max-h-[460px] overflow-y-auto divide-y">
                {services.length === 0 && (
                  <p className="text-xs text-muted-foreground italic p-4">
                    No services in your catalog. Add some in <span className="font-medium">Services</span>.
                  </p>
                )}
                {services.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => addService(svc)}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-accent/40 transition-colors"
                  >
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: 'var(--orange)' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold truncate">
                        {svc.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formatCurrency(svc.base_price)} · {svc.unit.replace('_', ' ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t p-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomLineItem}
                  className="w-full justify-start gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Custom Line Item
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT — line items + property panel */}
          <div className="space-y-4">
            {measurementTurfSqft > 0 && (
              <MeasurementBanner
                totalTurfSqft={measurementTurfSqft}
                perSqftLineCount={perSqftLineCount}
                onApply={applyMeasurementToLines}
              />
            )}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <p className="text-sm font-semibold">Line items ({items.length})</p>
                {/* Margin chip is hidden until per-service cost data exists.
                 *  See lib/proposal-pricing.ts:profitMargin() — current cost
                 *  estimate is a stub. CTA links to where to set real costs. */}
                <Link
                  href="/dashboard/services"
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  title="Add labor + material estimates per service to see live margin"
                >
                  Set service costs to see margin →
                </Link>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-4 py-8 text-center">
                  Add services from the catalog, use a preset, or click <strong>+ Custom Line Item</strong>.
                </p>
              ) : (
                <ul className="divide-y">
                  {items.map((it) => {
                    const isCustom = it.service_id === null;
                    const isMonthly = it.billing_mode === 'per_month';
                    const suggested = !isMonthly
                      ? suggestedMonthlyRate(it, flags)
                      : 0;
                    return (
                    <li key={it._key} className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Input
                              value={it.description}
                              onChange={(e) => updateItem(it._key, { description: e.target.value })}
                              className="h-8 text-sm font-medium"
                              placeholder={isCustom ? 'e.g. Trim the rose bushes' : ''}
                            />
                            {isCustom && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                <Sparkles className="h-2.5 w-2.5" /> Custom
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeItem(it._key)}
                          aria-label="Remove line item"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Frequency + Billing-mode toggle row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground uppercase">Frequency</Label>
                          <Select
                            value={it.frequency}
                            onValueChange={(v) => setFrequency(it._key, v as LineItemFrequency)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(FREQUENCY_LABELS) as LineItemFrequency[]).map((f) => (
                                <SelectItem key={f} value={f}>
                                  {FREQUENCY_LABELS[f]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground uppercase">Billing</Label>
                          <div className="inline-flex h-8 w-full rounded-md border bg-background p-0.5">
                            {(['per_visit', 'per_month'] as BillingMode[]).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setBillingMode(it._key, m)}
                                className={cn(
                                  'flex-1 rounded text-[10px] font-semibold transition-colors capitalize',
                                  it.billing_mode === m
                                    ? 'bg-[var(--orange)] text-white'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                                title={m === 'per_visit' ? 'Bill per completed visit / service' : 'Bill a fixed monthly rate'}
                              >
                                {m === 'per_visit' ? 'Per visit' : 'Per month'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Per-visit fields */}
                      {!isMonthly && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase">Qty</Label>
                            <Input
                              type="number" min={0} step={0.5}
                              value={it.quantity}
                              onChange={(e) => updateItem(it._key, { quantity: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          {isCustom && (
                            <div>
                              <Label className="text-[10px] text-muted-foreground uppercase">Unit</Label>
                              <Input
                                value={it.unit ?? ''}
                                onChange={(e) => updateItem(it._key, { unit: e.target.value })}
                                placeholder="each, hour, sq ft"
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase">Unit $</Label>
                            <Input
                              type="number" min={0} step={0.01}
                              value={it.unit_price}
                              onChange={(e) => updateItem(it._key, { unit_price: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase">Markup %</Label>
                            <Input
                              type="number" min={0} step={1}
                              value={it.markup_pct}
                              onChange={(e) => updateItem(it._key, { markup_pct: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase">Disc %</Label>
                            <Input
                              type="number" min={0} max={100} step={1}
                              value={it.discount_pct}
                              onChange={(e) => updateItem(it._key, { discount_pct: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                        </div>
                      )}

                      {/* Per-month field */}
                      {isMonthly && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase">Monthly $</Label>
                            <Input
                              type="number" min={0} step={0.01}
                              value={it.monthly_rate ?? 0}
                              onChange={(e) => updateItem(it._key, { monthly_rate: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="flex items-end">
                            <span className="text-[10px] text-muted-foreground italic">
                              Annual = monthly × 12 = {formatCurrency((Number(it.monthly_rate ?? 0)) * 12)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Notes (optional) — always available, useful for custom lines */}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                          {it.notes ? 'Notes (printed on proposal)' : 'Add notes'}
                        </summary>
                        <textarea
                          value={it.notes ?? ''}
                          onChange={(e) => updateItem(it._key, { notes: e.target.value })}
                          rows={2}
                          placeholder="Additional details for this line — prints on the proposal PDF."
                          className="mt-1.5 w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </details>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex flex-wrap gap-1.5">
                          {!isMonthly && (it.frequency_discount_pct ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-semibold">
                              {FREQUENCY_LABELS[it.frequency]} client save {it.frequency_discount_pct}%
                            </span>
                          )}
                          {!isMonthly && it.frequency !== 'one_time' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)] px-2 py-0.5 text-[10px] font-semibold">
                              ~{FREQUENCY_VISITS_PER_YEAR[it.frequency]}× / year
                            </span>
                          )}
                          {!isMonthly && suggested > 0 && (
                            <button
                              type="button"
                              onClick={() => setBillingMode(it._key, 'per_month')}
                              className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-semibold hover:bg-green-200 transition-colors"
                              title="Tap to switch this line to per-month billing"
                            >
                              <CalendarIcon className="h-2.5 w-2.5" />
                              Suggested {formatCurrency(suggested)}/mo
                            </button>
                          )}
                          {isMonthly && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)] px-2 py-0.5 text-[10px] font-semibold">
                              <CalendarIcon className="h-2.5 w-2.5" /> Recurring monthly
                            </span>
                          )}
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(lineTotal(it, flags))}
                          <span className="text-muted-foreground font-normal">
                            {' '}/ {isMonthly ? 'month' : 'visit'}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                  })}
                </ul>
              )}
            </div>

            {/* Property details panel */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setPropertyOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-accent/30"
              >
                Property details
                <span className="text-xs text-muted-foreground">
                  {propertyOpen ? 'Hide' : 'Show'} (×{laborMultiplier(flags).toFixed(2)} labor)
                </span>
              </button>
              {propertyOpen && (
                <div className="border-t p-4 space-y-4">
                  {/* Resolved multiplier breakdown — additive: 15+10+5 = +30%, not 1.328 */}
                  {(() => {
                    const bd = laborMultiplierBreakdown(flags);
                    if (bd.parts.length === 0) return null;
                    return (
                      <p className="text-[11px] text-muted-foreground">
                        Labor multiplier: <strong className="text-foreground">+{bd.parts.reduce((s, p) => s + p.pct, 0)}%</strong>
                        {' = '}
                        {bd.parts.map((p, i) => (
                          <span key={p.label}>
                            {p.label} +{p.pct}%{i < bd.parts.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </p>
                    );
                  })()}
                  <div>
                    <Label className="text-xs mb-1.5 block">Complexity</Label>
                    <div className="flex gap-1.5">
                      {(['simple', 'moderate', 'complex'] as PropertyComplexity[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFlags((f) => ({ ...f, property_complexity: c }))}
                          className={cn(
                            'flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                            flags.property_complexity === c
                              ? 'border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-deep)]'
                              : 'bg-background text-muted-foreground hover:border-foreground/30'
                          )}
                        >
                          {c}
                          {c !== 'simple' && (
                            <span className="block text-[9px] opacity-70 font-normal">
                              +{c === 'moderate' ? 15 : 30}% labor
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(['has_slopes', 'has_dogs', 'has_obstacles'] as const).map((k) => (
                      <div key={k} className="flex items-center justify-between text-xs">
                        <span className="capitalize">
                          {k.replace('has_', 'Has ')}
                          {k === 'has_slopes' && <span className="text-muted-foreground"> · +10% labor</span>}
                          {k === 'has_dogs' && <span className="text-muted-foreground"> · +5% labor</span>}
                        </span>
                        <Switch
                          checked={flags[k]}
                          onCheckedChange={(v) => setFlags((f) => ({ ...f, [k]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live totals */}
            <div className="rounded-xl border bg-card p-4 space-y-1 text-sm">
              {subtotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Per-visit subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {monthlyTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Monthly recurring</span>
                  <span className="tabular-nums">{formatCurrency(monthlyTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-foreground font-semibold">
                <span>Annual contract value</span>
                <span className="tabular-nums" style={{ color: 'var(--orange)' }}>
                  {formatCurrency(annual)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5 h-11 w-full sm:w-auto">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                className="gap-1.5 h-11 w-full sm:w-auto"
              >
                Review <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 — review */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <div className="rounded-xl border bg-card p-6 space-y-5">
            <header className="flex items-start justify-between border-b pb-4">
              <div>
                <p
                  className="page-eyebrow"
                  style={{ fontFamily: 'var(--font-hand), cursive', color: 'var(--orange)', fontSize: 18, fontWeight: 700 }}
                >
                  TLC Management Platform
                </p>
                <h2 className="page-title" style={{ fontSize: 28 }}>{title}</h2>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Date: {new Date().toLocaleDateString()}</p>
                <p>Valid through: {new Date(validUntil).toLocaleDateString()}</p>
              </div>
            </header>

            {client && (
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prepared for</p>
                  <p className="text-sm font-bold">{client.name}</p>
                  {client.service_address && <p className="text-muted-foreground">{client.service_address}</p>}
                </div>
                <div>
                  <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Payment terms</p>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Service</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Frequency</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Billing</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Qty × $</th>
                  <th className="text-right px-3 py-2 font-semibold w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => {
                  const isCustom = it.service_id === null;
                  const isMonthly = it.billing_mode === 'per_month';
                  return (
                    <tr key={it._key}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {it.description}
                          {isCustom && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                              <Sparkles className="h-2.5 w-2.5" /> Custom
                            </span>
                          )}
                        </span>
                        {it.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 italic">
                            {it.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {FREQUENCY_LABELS[it.frequency]}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground capitalize">
                        {isMonthly ? 'Per month' : 'Per visit'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {isMonthly
                          ? `${formatCurrency(Number(it.monthly_rate ?? 0))} / mo`
                          : `${it.quantity}${it.unit ? ' ' + it.unit : ''} × ${formatCurrency(it.unit_price)}`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(lineTotal(it, flags))}
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          / {isMonthly ? 'month' : 'visit'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              {subtotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Per-visit subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {monthlyTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Monthly recurring</span>
                  <span className="tabular-nums">{formatCurrency(monthlyTotal)}</span>
                </div>
              )}
              {subtotal > 0 && (
                <div className="flex items-center justify-between text-muted-foreground gap-2">
                  <span>Tax % (per-visit)</span>
                  <Input
                    type="number" min={0} step={0.1}
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="h-7 w-16 text-xs text-right tabular-nums"
                  />
                </div>
              )}
              {grandTotal > 0 && (
                <div
                  className="flex justify-between text-white font-bold rounded-md px-3 py-2 mt-1"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  <span>Total per visit</span>
                  <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
                </div>
              )}
              {monthlyTotal > 0 && (
                <div
                  className="flex justify-between text-white font-bold rounded-md px-3 py-2"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  <span>Total per month</span>
                  <span className="tabular-nums">{formatCurrency(monthlyTotal)}</span>
                </div>
              )}
              {annual > 0 && (
                <div
                  className="flex justify-between font-bold rounded-md px-3 py-2"
                  style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}
                >
                  <span>Annual value</span>
                  <span className="tabular-nums">{formatCurrency(annual)}</span>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Anything the client should know — scope notes, exclusions, etc."
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-dashed bg-card p-4 space-y-2 text-xs">
              <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                Profit margin
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Live margin requires per-service labor and material estimates.
                Add those once on{' '}
                <Link href="/dashboard/services" className="font-semibold underline">
                  Services
                </Link>{' '}
                and this card will surface a real number.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="w-full gap-1.5 h-11"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to services
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave('draft')}
              disabled={saving !== null}
              className="w-full gap-1.5 h-11"
            >
              {saving === 'draft'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Save className="h-3.5 w-3.5" />}
              Save Draft
            </Button>
            <Button
              onClick={() => handleSave('sent')}
              disabled={saving !== null}
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              className="w-full gap-1.5 h-11"
            >
              {saving === 'send'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              Send to Client
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PathCard({
  active, onClick, icon, title, desc, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-all',
        active && 'ring-2 ring-[var(--orange)] border-[var(--orange)]'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 p-4 text-left transition-colors',
          !active && 'hover:bg-accent/40'
        )}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{
            backgroundColor: active ? 'var(--orange)' : 'var(--orange-soft)',
            color: active ? '#fff' : 'var(--orange-deep)',
          }}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{desc}</span>
        </span>
      </button>
      {children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
