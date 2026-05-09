'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/types';

const DAY_KEYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;
const DAY_LABELS: Record<typeof DAY_KEYS[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

interface Props {
  company: Company;
}

export function CompanyInfoForm({ company }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: company.name ?? '',
    address: company.address ?? '',
    city: company.city ?? '',
    state: company.state ?? '',
    zip: company.zip ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    tagline: company.tagline ?? '',
    service_area: company.service_area ?? '',
    logo_url: company.logo_url ?? '',
  });

  const initialHours = (company.business_hours ?? {}) as Record<string, string>;
  const [hours, setHours] = useState<Record<string, string>>(
    Object.fromEntries(DAY_KEYS.map((d) => [d, initialHours[d] ?? ''])),
  );

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file (PNG, JPG, SVG).');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${company.id}/logo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase
        .storage
        .from('company-logos')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path);
      update('logo_url', pub.publicUrl);
      toast.success('Logo uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function save() {
    setSaving(true);
    const business_hours = Object.fromEntries(
      Object.entries(hours).filter(([, v]) => v.trim().length > 0),
    );
    const { error } = await supabase
      .from('companies')
      .update({
        ...form,
        business_hours: Object.keys(business_hours).length > 0 ? business_hours : null,
      })
      .eq('id', company.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Company info saved.');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Logo */}
      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-center gap-4">
          {form.logo_url ? (
            <div className="relative h-20 w-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logo_url} alt="Logo" className="h-20 w-20 object-contain" />
              <button
                type="button"
                onClick={() => update('logo_url', '')}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
                title="Remove logo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground">
              No logo
            </div>
          )}
          <label
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm cursor-pointer hover:bg-accent/30"
          >
            {uploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload logo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={uploading}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          PNG / JPG / SVG. Appears on PDFs and the customer portal header.
        </p>
      </div>

      {/* Identity */}
      <div className="space-y-2">
        <Label htmlFor="ci-name">Company name *</Label>
        <Input id="ci-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ci-tagline">Tagline</Label>
        <Input
          id="ci-tagline"
          value={form.tagline}
          placeholder="e.g., Reliable Landscape Management for a Yard You'll Love"
          onChange={(e) => update('tagline', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One-line slogan shown on PDFs and the portal header.
        </p>
      </div>

      {/* Address */}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        <div className="sm:col-span-6 space-y-2">
          <Label htmlFor="ci-addr">Street address</Label>
          <Input id="ci-addr" value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
        <div className="sm:col-span-3 space-y-2">
          <Label htmlFor="ci-city">City</Label>
          <Input id="ci-city" value={form.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div className="sm:col-span-1 space-y-2">
          <Label htmlFor="ci-state">State</Label>
          <Input id="ci-state" value={form.state} onChange={(e) => update('state', e.target.value)} maxLength={2} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="ci-zip">ZIP</Label>
          <Input id="ci-zip" value={form.zip} onChange={(e) => update('zip', e.target.value)} />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ci-phone">Phone</Label>
          <Input id="ci-phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ci-email">Email</Label>
          <Input id="ci-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ci-website">Website</Label>
        <Input
          id="ci-website"
          type="url"
          placeholder="https://"
          value={form.website}
          onChange={(e) => update('website', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ci-area">Service area</Label>
        <Input
          id="ci-area"
          placeholder="e.g., Tri-Cities, WA (Kennewick, Pasco, Richland)"
          value={form.service_area}
          onChange={(e) => update('service_area', e.target.value)}
        />
      </div>

      {/* Business hours */}
      <div className="space-y-2">
        <Label>Business hours</Label>
        <div className="rounded-lg border divide-y">
          {DAY_KEYS.map((day) => (
            <div key={day} className="flex items-center gap-3 px-3 py-2">
              <span className="text-sm font-medium w-24 text-muted-foreground">
                {DAY_LABELS[day]}
              </span>
              <Input
                value={hours[day]}
                placeholder="e.g., 8:00 AM – 4:30 PM, or Closed"
                onChange={(e) => setHours((h) => ({ ...h, [day]: e.target.value }))}
                className="h-8"
              />
            </div>
          ))}
        </div>
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="w-full text-white"
        style={{ backgroundColor: 'var(--orange)' }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save company info
      </Button>
    </div>
  );
}
