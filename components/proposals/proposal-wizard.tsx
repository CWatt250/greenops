'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Check, MapPin, Phone, Mail,
} from 'lucide-react';
import {
  FREQUENCY_LABELS, FREQUENCY_DISCOUNT_PCT, FREQUENCY_VISITS_PER_YEAR,
  laborMultiplier, lineTotal, annualValue, profitMargin, marginColor,
  type LineItemDraft, type PricingFlags,
} from '@/lib/proposal-pricing';
import type {
  Client, Service, LineItemFrequency, PropertyComplexity,
} from '@/types';

interface Props {
  companyId: string;
  userId: string;
  services: Service[];
  initialClientId?: string;
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
  };
}

function pickByCategory(services: Service[], cats: string[]): Service[] {
  return services.filter((s) => cats.includes(s.category));
}

export function ProposalWizard({ companyId, userId, services, initialClientId }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientId, setClientId] = useState<string>(initialClientId ?? '');
  const [client, setClient] = useState<Client | null>(null);
  const [measurementTurfSqft, setMeasurementTurfSqft] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
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

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + lineTotal(i, flags), 0),
    [items, flags]
  );
  const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);
  const grandTotal = subtotal + taxAmount;
  const annual = useMemo(() => annualValue(items, flags), [items, flags]);
  const margin = useMemo(() => profitMargin(items, flags), [items, flags]);
  const marginTone = marginColor(margin);

  // Look up the client's primary measurement so the banner can offer to
  // apply turf sqft to per-sqft line items.
  useEffect(() => {
    if (!client) {
      setMeasurementTurfSqft(0);
      return;
    }
    const measId = (client as Client & { primary_measurement_id?: string | null }).primary_measurement_id;
    if (!measId) {
      setMeasurementTurfSqft(0);
      return;
    }
    let cancelled = false;
    supabase
      .from('property_measurements')
      .select('total_turf_sqft')
      .eq('id', measId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setMeasurementTurfSqft(Number(data?.total_turf_sqft ?? 0));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

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
        tax_rate: taxRate,
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

    const inserts = items.map((it, i) => ({
      estimate_id: estimate.id,
      service_id: it.service_id,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      markup_pct: it.markup_pct,
      discount_pct: it.discount_pct,
      frequency: it.frequency,
      frequency_discount_pct: it.frequency_discount_pct,
      sort_order: i,
    }));

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
      {/* Step indicator */}
      <ol className="flex items-center gap-2">
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

      {/* STEP 1 — pick client */}
      {step === 1 && (
        <div className="rounded-xl border bg-card p-6 space-y-5 max-w-xl">
          <div>
            <Label className="text-xs mb-1.5 block">Client</Label>
            <ClientCombobox
              value={clientId}
              onChange={(id, c) => {
                setClientId(id);
                setClient(c);
              }}
            />
          </div>

          {client && (
            <div className="rounded-lg bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{client.name}</h3>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)]">
                  {client.property_type}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {client.service_address && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> {client.service_address}
                  </p>
                )}
                {client.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {client.phone}
                  </p>
                )}
                {client.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {client.email}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              disabled={!clientId}
              onClick={() => setStep(2)}
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              className="gap-1.5"
            >
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

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
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5',
                    marginTone === 'green' && 'bg-green-100 text-green-700',
                    marginTone === 'yellow' && 'bg-amber-100 text-amber-700',
                    marginTone === 'red' && 'bg-red-100 text-red-700'
                  )}
                >
                  Margin {margin}%
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-4 py-8 text-center">
                  Add services from the catalog or use a quick-add preset.
                </p>
              ) : (
                <ul className="divide-y">
                  {items.map((it) => (
                    <li key={it._key} className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={it.description}
                          onChange={(e) => updateItem(it._key, { description: e.target.value })}
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeItem(it._key)}
                          aria-label="Remove line item"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex flex-wrap gap-1.5">
                          {(it.frequency_discount_pct ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-semibold">
                              {FREQUENCY_LABELS[it.frequency]} client save {it.frequency_discount_pct}%
                            </span>
                          )}
                          {it.frequency !== 'one_time' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)] px-2 py-0.5 text-[10px] font-semibold">
                              ~{FREQUENCY_VISITS_PER_YEAR[it.frequency]}× / year
                            </span>
                          )}
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(lineTotal(it, flags))} <span className="text-muted-foreground font-normal">/ visit</span>
                        </span>
                      </div>
                    </li>
                  ))}
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
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal (per visit)</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-foreground font-semibold">
                <span>Annual contract value</span>
                <span className="tabular-nums" style={{ color: 'var(--orange)' }}>
                  {formatCurrency(annual)}
                </span>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                className="gap-1.5"
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
                  <th className="text-right px-3 py-2 font-semibold w-24">Qty × $</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => (
                  <tr key={it._key}>
                    <td className="px-3 py-2">{it.description}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {FREQUENCY_LABELS[it.frequency]}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {it.quantity} × {formatCurrency(it.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatCurrency(lineTotal(it, flags))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal (per visit)</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground gap-2">
                <span>Tax %</span>
                <Input
                  type="number" min={0} step={0.1}
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="h-7 w-16 text-xs text-right tabular-nums"
                />
              </div>
              <div
                className="flex justify-between text-white font-bold rounded-md px-3 py-2 mt-1"
                style={{ backgroundColor: 'var(--orange)' }}
              >
                <span>Total per visit</span>
                <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
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
            <div className="rounded-xl border bg-card p-4 space-y-2 text-xs">
              <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                Profit margin
              </p>
              <p
                className={cn(
                  'text-2xl font-bold',
                  marginTone === 'green' && 'text-green-700',
                  marginTone === 'yellow' && 'text-amber-700',
                  marginTone === 'red' && 'text-red-700'
                )}
              >
                {margin}%
              </p>
              {marginTone === 'red' && (
                <p className="text-[11px] text-red-700">
                  Margin is low — consider raising prices or trimming services.
                </p>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="w-full gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to services
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave('draft')}
              disabled={saving !== null}
              className="w-full gap-1.5"
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
              className="w-full gap-1.5"
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
