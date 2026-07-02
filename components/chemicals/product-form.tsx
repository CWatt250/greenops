'use client';

import { useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { RATE_UNITS, PRODUCT_TYPE_LABELS } from '@/lib/chemicals';
import type { ChemicalProduct } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  manufacturer: z.string().optional(),
  epa_registration_number: z.string().optional(),
  active_ingredient: z.string().optional(),
  product_type: z.enum(['herbicide', 'insecticide', 'fungicide', 'fertilizer', 'growth_regulator', 'other']),
  default_rate: z.number().min(0).optional(),
  rate_unit: z.string(),
  reentry_interval_hours: z.number().int().min(0, 'Hours must be 0 or more'),
  sds_url: z.string().url('Must be a full URL (https://…)').optional().or(z.literal('')),
  notes: z.string().optional(),
  is_active: z.boolean(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  product: ChemicalProduct | null; // null = create
  onSaved: () => void;
}

export function ProductForm({ open, onOpenChange, companyId, product, onSaved }: Props) {
  const supabase = createClient();
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: blank(),
  });

  function blank(): FormData {
    return {
      name: '', manufacturer: '', epa_registration_number: '', active_ingredient: '',
      product_type: 'herbicide', default_rate: undefined, rate_unit: 'oz_per_gal',
      reentry_interval_hours: 0, sds_url: '', notes: '', is_active: true,
    };
  }

  useEffect(() => {
    if (!open) return;
    reset(product ? {
      name: product.name,
      manufacturer: product.manufacturer ?? '',
      epa_registration_number: product.epa_registration_number ?? '',
      active_ingredient: product.active_ingredient ?? '',
      product_type: (product.product_type ?? 'other') as FormData['product_type'],
      default_rate: product.default_rate ?? undefined,
      rate_unit: product.rate_unit ?? 'oz_per_gal',
      reentry_interval_hours: product.reentry_interval_hours ?? 0,
      sds_url: product.sds_url ?? '',
      notes: product.notes ?? '',
      is_active: product.is_active,
    } : blank());
  }, [open, product, reset]);

  async function onSubmit(data: FormData) {
    const row = {
      company_id: companyId,
      name: data.name,
      manufacturer: data.manufacturer || null,
      epa_registration_number: data.epa_registration_number || null,
      active_ingredient: data.active_ingredient || null,
      product_type: data.product_type,
      default_rate: data.default_rate ?? null,
      rate_unit: data.rate_unit,
      reentry_interval_hours: data.reentry_interval_hours,
      sds_url: data.sds_url || null,
      notes: data.notes || null,
      is_active: data.is_active,
    };
    const q = product
      ? supabase.from('chemical_products').update(row).eq('id', product.id)
      : supabase.from('chemical_products').insert(row);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(product ? 'Product updated.' : 'Product added.');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product ? 'Edit Product' : 'Add Chemical Product'}</SheetTitle>
          <SheetDescription>
            EPA registration and re-entry interval come straight off the product label.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Product name *</Label>
            <Input id="cp-name" {...register('name')} placeholder="SpeedZone Broadleaf" className="h-9 text-sm" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={watch('product_type')}
                onValueChange={(v) => setValue('product_type', v as FormData['product_type'])}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-mfr">Manufacturer</Label>
              <Input id="cp-mfr" {...register('manufacturer')} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-epa">EPA Reg #</Label>
              <Input id="cp-epa" {...register('epa_registration_number')} placeholder="2217-833" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-ai">Active ingredient</Label>
              <Input id="cp-ai" {...register('active_ingredient')} placeholder="2,4-D" className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-rate">Default rate</Label>
              <Input
                id="cp-rate" type="number" step="0.0001" min="0"
                {...register('default_rate', {
                  setValueAs: (v) => (v === '' || v === null ? undefined : parseFloat(v)),
                })}
                className="h-9 text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate unit</Label>
              <Select value={watch('rate_unit')} onValueChange={(v) => setValue('rate_unit', v ?? 'oz_per_gal')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-rei">Re-entry interval (hours)</Label>
            <Input
              id="cp-rei" type="number" min="0" step="1"
              {...register('reentry_interval_hours', { valueAsNumber: true })}
              className="h-9 text-sm tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              0 = no restriction. Customers see &ldquo;safe to re-enter after&rdquo; based on this.
            </p>
            {errors.reentry_interval_hours && (
              <p className="text-xs text-destructive">{errors.reentry_interval_hours.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-sds">SDS link</Label>
            <Input id="cp-sds" {...register('sds_url')} placeholder="https://…" className="h-9 text-sm" />
            {errors.sds_url && <p className="text-xs text-destructive">{errors.sds_url.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-notes">Notes</Label>
            <textarea
              id="cp-notes" {...register('notes')} rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">Active (available to crews)</span>
            <Switch checked={watch('is_active')} onCheckedChange={(v) => setValue('is_active', v)} />
          </div>

          <Button
            type="submit" disabled={isSubmitting} className="w-full gap-1.5 text-white"
            style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {product ? 'Save Changes' : 'Add Product'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
