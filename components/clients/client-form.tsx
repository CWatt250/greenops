'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Home, Building2, Building, Ruler } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Client } from '@/types';
import {
  draftStorageKey,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  loadPendingMeasurement,
  clearPendingMeasurement,
} from '@/lib/hooks/use-client-form-draft';

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  preferred_contact: z.enum(['phone', 'email', 'sms']),
  property_type: z.enum(['residential', 'commercial', 'hoa']),
  service_address: z.string().min(1, 'Service address is required'),
  service_city: z.string().optional(),
  service_state: z.string().optional(),
  service_zip: z.string().optional(),
  billing_same_as_service: z.boolean(),
  billing_address: z.string().optional(),
  lot_size_sqft: z.number().optional(),
  access_notes: z.string().optional(),
  gate_code: z.string().optional(),
  status: z.enum(['active', 'inactive', 'prospect', 'lead']),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientFormProps {
  initialData?: Partial<Client>;
  companyId: string;
}

export function ClientForm({ initialData, companyId }: ClientFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lotSizeSource, setLotSizeSource] = useState<'measured' | null>(null);
  const isEditMode = Boolean(initialData?.id);
  const clientId = initialData?.id;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      preferred_contact: initialData?.preferred_contact ?? 'phone',
      property_type: initialData?.property_type ?? 'residential',
      billing_same_as_service: initialData?.billing_same_as_service ?? true,
      status: initialData?.status ?? 'active',
      name: initialData?.name ?? '',
      company_name: initialData?.company_name ?? '',
      phone: initialData?.phone ?? '',
      email: initialData?.email ?? '',
      service_address: initialData?.service_address ?? '',
      service_city: initialData?.service_city ?? '',
      service_state: initialData?.service_state ?? '',
      service_zip: initialData?.service_zip ?? '',
      access_notes: initialData?.access_notes ?? '',
      gate_code: initialData?.gate_code ?? '',
    },
  });

  const billingSame = watch('billing_same_as_service');
  const propertyType = watch('property_type');
  const lotSizeProps = register('lot_size_sqft', { valueAsNumber: true });

  // On mount: restore draft (new client always; edit client only when returning from measure),
  // then apply any pending measurement result.
  useEffect(() => {
    const pendingSqft = loadPendingMeasurement();
    const hasPending = pendingSqft !== null;

    // Restore draft if: new client OR returning from measure (has pending measurement)
    if (!isEditMode || hasPending) {
      const draft = loadFormDraft(clientId);
      if (draft) {
        for (const [key, value] of Object.entries(draft)) {
          if (value !== undefined && value !== null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setValue(key as keyof ClientFormData, value as any);
          }
        }
        clearFormDraft(clientId);
      }
    }

    // Apply pending measurement (overwrites lot size from draft)
    if (hasPending) {
      setValue('lot_size_sqft', pendingSqft!);
      setLotSizeSource('measured');
      clearPendingMeasurement();
      toast.success(
        `Lot size set to ${pendingSqft!.toLocaleString()} sq ft from your measurement`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(data: ClientFormData) {
    setServerError(null);
    const payload = {
      ...data,
      company_id: companyId,
      email: data.email || null,
      billing_address: data.billing_same_as_service ? null : data.billing_address,
    };

    let result;
    if (initialData?.id) {
      result = await supabase.from('clients').update(payload).eq('id', initialData.id).select().single();
    } else {
      result = await supabase.from('clients').insert(payload).select().single();
    }

    if (result.error) {
      setServerError(result.error.message);
      return;
    }

    router.push(`/dashboard/clients/${result.data.id}`);
  }

  function handleMeasureProperty() {
    const address = getValues('service_address');
    if (!address?.trim()) {
      toast.error('Please fill in the Street Address first so we can find the property');
      document.getElementById('service_address')?.focus();
      return;
    }

    // Save current form state to localStorage so we can restore it on return.
    const formSnapshot = getValues();
    saveFormDraft(clientId, formSnapshot as Record<string, unknown>);

    const params = new URLSearchParams({
      return_to: 'client_form',
      address,
    });
    if (clientId) params.set('client_id', clientId);
    const name = getValues('name');
    if (name) params.set('client_name', name);

    router.push(`/dashboard/measure?${params.toString()}`);
  }

  const propertyTypes = [
    { value: 'residential', label: 'Residential', icon: Home },
    { value: 'commercial', label: 'Commercial', icon: Building2 },
    { value: 'hoa', label: 'HOA', icon: Building },
  ] as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
      {/* Property type selector */}
      <div>
        <Label className="mb-2 block">Property Type</Label>
        <div className="grid grid-cols-3 gap-3">
          {propertyTypes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setValue('property_type', value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all',
                propertyType === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40'
              )}
            >
              <Icon className="h-6 w-6" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name">Company / Organization</Label>
          <Input id="company_name" {...register('company_name')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" {...register('phone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferred_contact">Preferred Contact</Label>
          <Select
            defaultValue={initialData?.preferred_contact ?? 'phone'}
            onValueChange={(v) => setValue('preferred_contact', v as 'phone' | 'email' | 'sms')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            defaultValue={initialData?.status ?? 'active'}
            onValueChange={(v) => setValue('status', v as 'active' | 'inactive' | 'prospect' | 'lead')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Service address */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Service Address</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="service_address">Street Address *</Label>
            <Input id="service_address" {...register('service_address')} />
            {errors.service_address && (
              <p className="text-xs text-destructive">{errors.service_address.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="service_city">City</Label>
            <Input id="service_city" {...register('service_city')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="service_state">State</Label>
              <Input id="service_state" maxLength={2} {...register('service_state')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_zip">ZIP</Label>
              <Input id="service_zip" {...register('service_zip')} />
            </div>
          </div>
        </div>
      </div>

      {/* Billing address */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Billing Address</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="billing-same" className="text-sm text-muted-foreground">
              Same as service address
            </Label>
            <Switch
              id="billing-same"
              checked={billingSame}
              onCheckedChange={(v) => setValue('billing_same_as_service', v)}
            />
          </div>
        </div>
        {!billingSame && (
          <div className="space-y-2">
            <Label htmlFor="billing_address">Billing Address</Label>
            <Input id="billing_address" {...register('billing_address')} />
          </div>
        )}
      </div>

      {/* Property details */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Property Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="lot_size_sqft">Lot Size (sq ft)</Label>
              {lotSizeSource === 'measured' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: 'var(--orange-soft)',
                    color: 'var(--orange-deep)',
                    border: '1px solid var(--orange)',
                  }}
                >
                  <Ruler className="h-2.5 w-2.5" /> Measured
                </span>
              )}
            </div>
            <Input
              id="lot_size_sqft"
              type="number"
              {...lotSizeProps}
              onChange={(e) => {
                lotSizeProps.onChange(e);
                setLotSizeSource(null);
              }}
            />
            {/* Measure Property CTA */}
            <div className="mt-1.5">
              <button
                type="button"
                onClick={handleMeasureProperty}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 w-full sm:w-auto"
                style={{
                  borderColor: 'var(--orange)',
                  color: 'var(--orange-deep)',
                  backgroundColor: 'var(--orange-soft)',
                }}
              >
                <Ruler className="h-4 w-4 shrink-0" />
                Measure Property on Map
              </button>
              <p className="text-xs text-muted-foreground mt-1">
                Not sure of lot size? Trace the lawn on satellite imagery.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gate_code">Gate Code</Label>
            <Input id="gate_code" {...register('gate_code')} />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="access_notes">Access Notes</Label>
            <Input id="access_notes" {...register('access_notes')} />
          </div>
        </div>
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          {isSubmitting ? 'Saving…' : initialData?.id ? 'Update Client' : 'Save Client'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
