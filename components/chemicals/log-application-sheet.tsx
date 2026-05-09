'use client';

import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FlaskConical } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { ChemicalProduct, ApplicatorLicense } from '@/types';

interface Props {
  jobId: string;
  clientId: string;
  companyId: string;
  userId: string;
  /** Pre-fill from property measurement if available. */
  defaultArea?: number;
  /** Pre-fill the site address from the client / job. */
  defaultAddress?: string;
}

export function LogApplicationSheet({
  jobId, clientId, companyId, userId, defaultArea, defaultAddress,
}: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ChemicalProduct[]>([]);
  const [license, setLicense] = useState<ApplicatorLicense | null>(null);

  const [productId, setProductId] = useState('');
  const [targetPest, setTargetPest] = useState('');
  const [areaSqft, setAreaSqft] = useState<number>(defaultArea ?? 0);
  const [amount, setAmount] = useState<number>(0);
  const [amountUnit, setAmountUnit] = useState('oz');
  const [dilution, setDilution] = useState('');
  const [solutionGal, setSolutionGal] = useState<number>(0);
  const [tempF, setTempF] = useState<number | ''>('');
  const [windMph, setWindMph] = useState<number | ''>('');
  const [conditions, setConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [prodRes, licRes] = await Promise.all([
        supabase.from('chemical_products').select('*').eq('is_active', true).order('name'),
        supabase
          .from('applicator_licenses')
          .select('*')
          .eq('profile_id', userId)
          .order('expiration_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setProducts((prodRes.data ?? []) as ChemicalProduct[]);
      setLicense((licRes.data ?? null) as ApplicatorLicense | null);
    })();
    return () => { cancelled = true; };
  }, [open, supabase, userId]);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  async function submit() {
    if (!productId) { toast.error('Pick a product.'); return; }
    if (amount <= 0) { toast.error('Enter the amount applied.'); return; }
    setSaving(true);

    const reentry_until = selectedProduct?.reentry_interval_hours
      ? new Date(Date.now() + selectedProduct.reentry_interval_hours * 3600 * 1000).toISOString()
      : null;

    const { error } = await supabase.from('chemical_applications').insert({
      company_id: companyId,
      job_id: jobId,
      client_id: clientId,
      product_id: productId,
      applicator_id: userId,
      applied_at: new Date().toISOString(),
      target_pest: targetPest.trim() || null,
      area_treated_sqft: areaSqft || null,
      amount_applied: amount,
      amount_unit: amountUnit,
      dilution_rate: dilution.trim() || null,
      total_solution_gallons: solutionGal || null,
      weather_temp_f: tempF === '' ? null : tempF,
      weather_wind_mph: windMph === '' ? null : windMph,
      weather_conditions: conditions.trim() || null,
      site_address: defaultAddress ?? null,
      reentry_until,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Chemical application logged.');
    setOpen(false);
  }

  const noLicense = !license;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <FlaskConical className="h-4 w-4" />
        Log Chemical Application
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Log chemical application</SheetTitle>
            <SheetDescription>
              Saves a state-compliant record. Required by WA law for any
              pesticide / fertilizer treatment.
            </SheetDescription>
          </SheetHeader>

          {noLicense && (
            <div className="rounded-md bg-amber-100 text-amber-700 px-3 py-2 text-xs mb-3">
              ⚠️ You don't have an applicator license on file. Add one in
              <strong> Settings → Applicator licenses </strong>
              before logging applications.
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Product *</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Pick a chemical…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.epa_registration_number ? ` (EPA ${p.epa_registration_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct?.reentry_interval_hours ? (
                <p className="text-[11px] text-muted-foreground">
                  REI: {selectedProduct.reentry_interval_hours}h after application.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target pest / weed</Label>
              <Input
                value={targetPest}
                onChange={(e) => setTargetPest(e.target.value)}
                placeholder="Dandelions"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-3">
                <Label className="text-xs">Area treated (sq ft)</Label>
                <Input
                  type="number" step={1} min={0}
                  value={areaSqft}
                  onChange={(e) => setAreaSqft(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount applied *</Label>
                <Input
                  type="number" step={0.01} min={0}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Input
                  value={amountUnit}
                  onChange={(e) => setAmountUnit(e.target.value)}
                  placeholder="oz / lbs / gal"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Solution (gal)</Label>
                <Input
                  type="number" step={0.1} min={0}
                  value={solutionGal}
                  onChange={(e) => setSolutionGal(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dilution rate</Label>
              <Input
                value={dilution}
                onChange={(e) => setDilution(e.target.value)}
                placeholder="2 oz per gallon"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Temp (°F)</Label>
                <Input
                  type="number"
                  value={tempF}
                  onChange={(e) => setTempF(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wind (mph)</Label>
                <Input
                  type="number"
                  value={windMph}
                  onChange={(e) => setWindMph(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conditions</Label>
                <Input
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="Clear, sunny"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button
              onClick={submit}
              disabled={saving || !productId || amount <= 0}
              className="w-full gap-1.5"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FlaskConical className="h-3.5 w-3.5" />}
              Log application
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
