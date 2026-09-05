'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPES = [
  { value: 'quote_request', label: 'Get a quote' },
  { value: 'new_service', label: 'Start service' },
  { value: 'seasonal', label: 'Seasonal cleanup' },
  { value: 'other', label: 'Something else' },
];

export function PublicRequestForm({ slug, companyName }: { slug: string; companyName: string }) {
  const [type, setType] = useState('quote_request');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', zip: '', title: '', description: '', preferred_date: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.address.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please add your name, the property address, and a phone or email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/public/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, type, ...form, title: form.title || TYPES.find((t) => t.value === type)?.label }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Something went wrong — please call us.'); return; }
      setDone(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: 'var(--color-brand-green-raw)' }} />
        <h2 className="mt-3 text-lg font-bold">Request sent</h2>
        <p className="mt-1 text-sm text-muted-foreground">{companyName} has it and will reach out soon{form.email ? ` — we also emailed a copy to ${form.email}` : ''}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">What do you need?</Label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              aria-pressed={type === t.value}
              className={cn('min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors', type === t.value ? 'text-white' : 'bg-white hover:bg-muted')}
              style={type === t.value ? { backgroundColor: 'var(--color-brand-green-raw)', borderColor: 'var(--color-brand-green-raw)' } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="pr-name">Your name *</Label><Input id="pr-name" autoComplete="name" value={form.name} onChange={set('name')} required /></div>
        <div className="space-y-1.5"><Label htmlFor="pr-phone">Phone</Label><Input id="pr-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pr-email">Email</Label><Input id="pr-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pr-address">Property address *</Label><Input id="pr-address" autoComplete="street-address" value={form.address} onChange={set('address')} required /></div>
        <div className="space-y-1.5"><Label htmlFor="pr-city">City</Label><Input id="pr-city" autoComplete="address-level2" value={form.city} onChange={set('city')} /></div>
        <div className="space-y-1.5"><Label htmlFor="pr-zip">ZIP</Label><Input id="pr-zip" autoComplete="postal-code" inputMode="numeric" value={form.zip} onChange={set('zip')} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pr-desc">Tell us about the job</Label><Textarea id="pr-desc" rows={4} placeholder="Lot size, what you'd like done, how often…" value={form.description} onChange={set('description')} /></div>
        <div className="space-y-1.5"><Label htmlFor="pr-date">Preferred date</Label><Input id="pr-date" type="date" value={form.preferred_date} onChange={set('preferred_date')} /></div>
      </div>
      {/* Honeypot: bots fill it, people never see it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hidden" aria-hidden="true" />
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="h-11 w-full text-base font-semibold text-white" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send request
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">By sending, you agree {companyName} may contact you about this request.</p>
    </form>
  );
}
