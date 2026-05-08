'use client';

import { useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { MeasuredShape } from '@/lib/measurement';

export interface PrefilledAddress {
  service_address: string;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  userId: string;
  prefilledAddress: PrefilledAddress;
  shapes: MeasuredShape[];
  totalTurfSqft: number;
  totalHardscapeSqft: number;
  totalBedSqft: number;
  totalOtherSqft: number;
  /** Where to go after the create-and-save succeeds. */
  redirectTo: 'proposal' | 'client' | 'stay';
}

export function CreateCustomerFromMeasurement({
  open, onOpenChange, companyId, userId, prefilledAddress,
  shapes, totalTurfSqft, totalHardscapeSqft, totalBedSqft, totalOtherSqft,
  redirectTo,
}: Props) {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [propertyType, setPropertyType] = useState<'residential' | 'commercial' | 'hoa'>('residential');
  const [preferredContact, setPreferredContact] = useState<'phone' | 'email' | 'text'>('phone');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error('Name is required.'); return; }
    if (shapes.length === 0) { toast.error('Draw at least one shape first.'); return; }

    setBusy(true);

    // 1) Create the client. Status = 'prospect' so the office knows this is
    //    not a confirmed customer yet.
    const clientPayload = {
      company_id: companyId,
      name: name.trim(),
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      preferred_contact: preferredContact,
      property_type: propertyType,
      service_address: prefilledAddress.service_address,
      service_city: prefilledAddress.service_city ?? null,
      service_state: prefilledAddress.service_state ?? null,
      service_zip: prefilledAddress.service_zip ?? null,
      billing_same_as_service: true,
      lot_size_sqft: totalTurfSqft || null,
      access_notes: notes.trim() || null,
      status: 'prospect',
    };

    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert(clientPayload)
      .select('id')
      .single();

    if (clientErr || !client) {
      setBusy(false);
      toast.error(clientErr?.message ?? 'Failed to create customer.');
      return;
    }

    // 2) Save the measurement against the new client.
    const { data: measurement, error: measErr } = await supabase
      .from('property_measurements')
      .insert({
        company_id: companyId,
        client_id: client.id,
        measured_by: userId,
        total_turf_sqft: totalTurfSqft,
        total_hardscape_sqft: totalHardscapeSqft,
        total_bed_sqft: totalBedSqft,
        total_other_sqft: totalOtherSqft,
        shapes,
      })
      .select('id')
      .single();

    if (measErr || !measurement) {
      setBusy(false);
      // Client was created but measurement failed — surface the error so the
      // dispatcher can retry the measure save.
      toast.error(`Customer created, but measurement save failed: ${measErr?.message ?? 'unknown'}`);
      return;
    }

    // 3) Mark this measurement as the client's primary so proposals auto-link.
    await supabase
      .from('clients')
      .update({ primary_measurement_id: measurement.id })
      .eq('id', client.id);

    setBusy(false);
    toast.success('New customer created — measurement saved.');

    if (redirectTo === 'proposal') {
      window.location.href = `/dashboard/proposals/new?client_id=${client.id}&measurement_id=${measurement.id}`;
    } else if (redirectTo === 'client') {
      window.location.href = `/dashboard/clients/${client.id}`;
    } else {
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create new customer</SheetTitle>
          <SheetDescription>
            Address and lot size are pre-filled from this measurement.
            Status starts at <strong>Prospect</strong>.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Locked prefilled section */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              From measurement (auto-filled)
            </p>
            <p className="font-medium">{prefilledAddress.service_address}</p>
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              {prefilledAddress.service_city && <span>{prefilledAddress.service_city}</span>}
              {prefilledAddress.service_state && <span>{prefilledAddress.service_state}</span>}
              {prefilledAddress.service_zip && <span>{prefilledAddress.service_zip}</span>}
            </div>
            <p className="text-muted-foreground">
              Lot size: <span className="font-mono">{totalTurfSqft.toLocaleString()} sq ft</span>
            </p>
          </div>

          {/* Editable fields */}
          <div className="space-y-1.5">
            <Label htmlFor="cnm-name" className="text-xs">Name *</Label>
            <Input
              id="cnm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cnm-company" className="text-xs">Company (optional)</Label>
            <Input
              id="cnm-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cnm-phone" className="text-xs">Phone</Label>
              <Input
                id="cnm-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(509) 555-0100"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnm-email" className="text-xs">Email</Label>
              <Input
                id="cnm-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Property type</Label>
              <Select
                value={propertyType}
                onValueChange={(v) => setPropertyType((v ?? 'residential') as typeof propertyType)}
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
                value={preferredContact}
                onValueChange={(v) => setPreferredContact((v ?? 'phone') as typeof preferredContact)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cnm-notes" className="text-xs">Notes (optional)</Label>
            <textarea
              id="cnm-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Gate codes, dogs, special access notes…"
            />
          </div>

          <Button
            onClick={submit}
            disabled={busy || !name.trim() || shapes.length === 0}
            className="w-full gap-1.5"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {redirectTo === 'proposal'
              ? 'Create Customer + Generate Proposal'
              : 'Create Customer + Save Measurement'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
