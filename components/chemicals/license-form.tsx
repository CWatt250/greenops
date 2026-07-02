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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ApplicatorLicense } from '@/types';

const schema = z.object({
  profile_id: z.string().min(1, 'Pick a team member'),
  license_number: z.string().min(1, 'License number is required'),
  license_type: z.string().optional(),
  state: z.string().min(1),
  issued_date: z.string().optional(),
  expiration_date: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: Array<{ id: string; full_name: string | null }>;
  license: ApplicatorLicense | null; // null = create
  onSaved: () => void;
}

export function LicenseForm({ open, onOpenChange, members, license, onSaved }: Props) {
  const supabase = createClient();
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { profile_id: '', license_number: '', license_type: '', state: 'WA', issued_date: '', expiration_date: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset(license ? {
      profile_id: license.profile_id,
      license_number: license.license_number,
      license_type: license.license_type ?? '',
      state: license.state ?? 'WA',
      issued_date: license.issued_date ?? '',
      expiration_date: license.expiration_date ?? '',
    } : { profile_id: '', license_number: '', license_type: '', state: 'WA', issued_date: '', expiration_date: '' });
  }, [open, license, reset]);

  async function onSubmit(data: FormData) {
    const row = {
      profile_id: data.profile_id,
      license_number: data.license_number,
      license_type: data.license_type || null,
      state: data.state,
      issued_date: data.issued_date || null,
      expiration_date: data.expiration_date || null,
    };
    const q = license
      ? supabase.from('applicator_licenses').update(row).eq('id', license.id)
      : supabase.from('applicator_licenses').insert(row);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(license ? 'License updated.' : 'License added.');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{license ? 'Edit License' : 'Add Applicator License'}</SheetTitle>
          <SheetDescription>
            Applications can only be logged under a current license — expired ones block logging.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Team member *</Label>
            <Select
              value={watch('profile_id')}
              onValueChange={(v) => setValue('profile_id', v ?? '', { shouldValidate: true })}
              disabled={!!license}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.profile_id && <p className="text-xs text-destructive">{errors.profile_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-num">License # *</Label>
              <Input id="al-num" {...register('license_number')} placeholder="WA-12345" className="h-9 text-sm" />
              {errors.license_number && <p className="text-xs text-destructive">{errors.license_number.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-type">Type</Label>
              <Input id="al-type" {...register('license_type')} placeholder="Commercial Applicator" className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-state">State</Label>
              <Input id="al-state" {...register('state')} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-issued">Issued</Label>
              <Input id="al-issued" type="date" {...register('issued_date')} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-exp">Expires</Label>
              <Input id="al-exp" type="date" {...register('expiration_date')} className="h-9 text-sm" />
            </div>
          </div>

          <Button
            type="submit" disabled={isSubmitting} className="w-full gap-1.5 text-white"
            style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {license ? 'Save Changes' : 'Add License'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
