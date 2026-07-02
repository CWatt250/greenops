'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldAlert, CloudSun } from 'lucide-react';
import { toast } from 'sonner';
import {
  computeReentryUntil, isUsableLicense, licenseHealth, AMOUNT_UNITS,
} from '@/lib/chemicals';
import { getCurrentConditions } from '@/lib/weather-current';
import type { ApplicatorLicense, ChemicalProduct } from '@/types';

const schema = z.object({
  client_id: z.string().min(1, 'Pick a client'),
  product_id: z.string().min(1, 'Pick a product'),
  applied_at: z.string().min(1, 'When was it applied?'),
  amount_applied: z.number().positive('Amount must be greater than 0'),
  amount_unit: z.string().min(1),
  dilution_rate: z.string().optional(),
  total_solution_gallons: z.number().min(0).optional(),
  area_treated_sqft: z.number().min(0).optional(),
  target_pest: z.string().optional(),
  weather_temp_f: z.number().optional(),
  weather_wind_mph: z.number().optional(),
  weather_conditions: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface ClientOpt {
  id: string;
  name: string;
  service_address: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  userId: string;
  /** When set (crew flow), the client is fixed and the picker is hidden. */
  clientId?: string | null;
  jobId?: string | null;
  onSaved?: () => void;
}

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ApplicationForm({
  open, onOpenChange, companyId, userId, clientId, jobId, onSaved,
}: Props) {
  const supabase = createClient();
  const [products, setProducts] = useState<ChemicalProduct[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [myLicenses, setMyLicenses] = useState<ApplicatorLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const {
    register, handleSubmit, reset, setValue, watch, getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: clientId ?? '', product_id: '', applied_at: nowLocalInput(),
      amount_applied: undefined, amount_unit: 'oz', dilution_rate: '',
      total_solution_gallons: undefined, area_treated_sqft: undefined,
      target_pest: '', weather_temp_f: undefined, weather_wind_mph: undefined,
      weather_conditions: '', notes: '',
    },
  });

  const selectedClientId = watch('client_id');
  const selectedProductId = watch('product_id');
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const usableLicense = useMemo(
    () => myLicenses.find((l) => isUsableLicense(l)) ?? null,
    [myLicenses],
  );
  const expiredOnly = myLicenses.length > 0 && !usableLicense;

  // Load products, licenses, and (office flow) clients on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [prodRes, licRes, clientRes] = await Promise.all([
        supabase.from('chemical_products')
          .select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('applicator_licenses')
          .select('*').eq('profile_id', userId),
        clientId
          ? Promise.resolve({ data: null })
          : supabase.from('clients')
              .select('id, name, service_address, latitude, longitude')
              .eq('company_id', companyId).eq('status', 'active').order('name'),
      ]);
      if (cancelled) return;
      setProducts((prodRes.data ?? []) as ChemicalProduct[]);
      setMyLicenses((licRes.data ?? []) as ApplicatorLicense[]);
      if (clientRes.data) setClients(clientRes.data as ClientOpt[]);
      reset((prev) => ({ ...prev, client_id: clientId ?? '', applied_at: nowLocalInput() }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId, userId, clientId, reset, supabase]);

  // Prefill treated area from the client's latest property measurement, and
  // auto-capture weather from their stored coordinates.
  useEffect(() => {
    if (!open || !selectedClientId) return;
    let cancelled = false;
    (async () => {
      const [{ data: m }, { data: c }] = await Promise.all([
        supabase.from('property_measurements')
          .select('total_turf_sqft')
          .eq('client_id', selectedClientId)
          .order('measured_at', { ascending: false })
          .limit(1).maybeSingle(),
        supabase.from('clients')
          .select('latitude, longitude')
          .eq('id', selectedClientId).single(),
      ]);
      if (cancelled) return;
      const turf = Number(m?.total_turf_sqft ?? 0);
      if (turf > 0) setValue('area_treated_sqft', Math.round(turf));
      if (typeof c?.latitude === 'number' && typeof c?.longitude === 'number') {
        setWeatherLoading(true);
        const w = await getCurrentConditions(c.latitude, c.longitude);
        if (!cancelled && w) {
          setValue('weather_temp_f', w.tempF);
          setValue('weather_wind_mph', w.windMph);
          setValue('weather_conditions', w.conditions);
        }
        if (!cancelled) setWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedClientId, setValue, supabase]);

  // Default amount from the product label rate when the field is untouched.
  useEffect(() => {
    if (selectedProduct?.default_rate && !getValues('amount_applied')) {
      setValue('amount_applied', Number(selectedProduct.default_rate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  async function onSubmit(data: FormData) {
    if (!usableLicense) return; // gate is also rendered; belt + suspenders
    const product = products.find((p) => p.id === data.product_id);
    const appliedIso = new Date(data.applied_at).toISOString();
    let siteAddress: string | null = null;
    if (clientId || data.client_id) {
      const { data: c } = await supabase
        .from('clients').select('service_address')
        .eq('id', data.client_id).single();
      siteAddress = c?.service_address ?? null;
    }
    const { error } = await supabase.from('chemical_applications').insert({
      company_id: companyId,
      job_id: jobId ?? null,
      client_id: data.client_id,
      product_id: data.product_id,
      applicator_id: userId,
      applied_at: appliedIso,
      target_pest: data.target_pest || null,
      area_treated_sqft: data.area_treated_sqft ?? null,
      amount_applied: data.amount_applied,
      amount_unit: data.amount_unit,
      dilution_rate: data.dilution_rate || null,
      total_solution_gallons: data.total_solution_gallons ?? null,
      weather_temp_f: data.weather_temp_f ?? null,
      weather_wind_mph: data.weather_wind_mph ?? null,
      weather_conditions: data.weather_conditions || null,
      site_address: siteAddress,
      reentry_until: computeReentryUntil(appliedIso, product?.reentry_interval_hours),
      notes: data.notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Application logged.');
    onOpenChange(false);
    onSaved?.();
  }

  const licenseGate = !loading && !usableLicense;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Log Chemical Application</SheetTitle>
          <SheetDescription>
            Recorded under your applicator license for WSDA/EPA records.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : licenseGate ? (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700">
                <p className="font-semibold">
                  {expiredOnly ? 'Your applicator license has expired.' : 'No applicator license on file for you.'}
                </p>
                <p className="text-xs mt-1">
                  Applications must be logged under a current license. Ask the office to
                  update the registry under Dashboard → Chemicals.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-xs text-muted-foreground -mt-1">
              License: <span className="font-medium">{usableLicense!.license_number}</span>
              {(() => {
                const h = licenseHealth(usableLicense!);
                return h.status === 'expiring' || h.status === 'critical'
                  ? <span className="text-amber-600 font-medium"> — expires in {h.daysLeft}d</span>
                  : null;
              })()}
            </p>

            {!clientId && (
              <div className="space-y-1.5">
                <Label>Client / property *</Label>
                <Select
                  value={selectedClientId}
                  onValueChange={(v) => setValue('client_id', v ?? '', { shouldValidate: true })}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.client_id && <p className="text-xs text-destructive">{errors.client_id.message}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Select
                value={selectedProductId}
                onValueChange={(v) => setValue('product_id', v ?? '', { shouldValidate: true })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.reentry_interval_hours ? ` · REI ${p.reentry_interval_hours}h` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 && (
                <p className="text-xs text-amber-600">
                  No active products in the catalog yet — add them under Dashboard → Chemicals.
                </p>
              )}
              {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ca-at">Applied at *</Label>
              <Input id="ca-at" type="datetime-local" {...register('applied_at')} className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ca-amt">Amount *</Label>
                <Input
                  id="ca-amt" type="number" step="0.0001" min="0"
                  {...register('amount_applied', { valueAsNumber: true })}
                  className="h-9 text-sm tabular-nums"
                />
                {errors.amount_applied && <p className="text-xs text-destructive">{errors.amount_applied.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={watch('amount_unit')} onValueChange={(v) => setValue('amount_unit', v ?? 'oz')}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AMOUNT_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ca-dil">Dilution</Label>
                <Input id="ca-dil" {...register('dilution_rate')} placeholder="1.5 oz/gal" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-sol">Total solution (gal)</Label>
                <Input
                  id="ca-sol" type="number" step="0.1" min="0"
                  {...register('total_solution_gallons', {
                    setValueAs: (v) => (v === '' || v === null ? undefined : parseFloat(v)),
                  })}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ca-area">Area treated (sqft)</Label>
                <Input
                  id="ca-area" type="number" step="1" min="0"
                  {...register('area_treated_sqft', {
                    setValueAs: (v) => (v === '' || v === null ? undefined : parseFloat(v)),
                  })}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-pest">Target pest</Label>
                <Input id="ca-pest" {...register('target_pest')} placeholder="Broadleaf weeds" className="h-9 text-sm" />
              </div>
            </div>

            <div className="rounded-md border px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <CloudSun className="h-3.5 w-3.5 text-muted-foreground" />
                Conditions at application
                {weatherLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="ca-temp" className="text-[11px]">Temp °F</Label>
                  <Input
                    id="ca-temp" type="number"
                    {...register('weather_temp_f', {
                      setValueAs: (v) => (v === '' || v === null ? undefined : parseFloat(v)),
                    })}
                    className="h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ca-wind" className="text-[11px]">Wind mph</Label>
                  <Input
                    id="ca-wind" type="number"
                    {...register('weather_wind_mph', {
                      setValueAs: (v) => (v === '' || v === null ? undefined : parseFloat(v)),
                    })}
                    className="h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ca-cond" className="text-[11px]">Sky</Label>
                  <Input id="ca-cond" {...register('weather_conditions')} placeholder="clear" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {selectedProduct?.reentry_interval_hours ? (
              <p className="text-xs text-muted-foreground">
                Re-entry: customers will see &ldquo;safe after&rdquo;{' '}
                {selectedProduct.reentry_interval_hours}h from the applied time.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="ca-notes">Notes</Label>
              <textarea
                id="ca-notes" {...register('notes')} rows={2}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <Button
              type="submit" disabled={isSubmitting} className="w-full gap-1.5 text-white"
              style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Log Application
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
