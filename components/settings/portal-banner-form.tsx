'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface Props {
  companyId: string;
  initial: {
    portal_banner_message?: string | null;
    portal_banner_cta_label?: string | null;
    portal_banner_cta_url?: string | null;
    portal_banner_expires_at?: string | null;
    portal_banner_enabled?: boolean | null;
  };
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  // Accepts an ISO timestamptz; chops to YYYY-MM-DD for the date input.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function PortalBannerForm({ companyId, initial }: Props) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState<boolean>(!!initial.portal_banner_enabled);
  const [message, setMessage] = useState(initial.portal_banner_message ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial.portal_banner_cta_label ?? '');
  const [ctaUrl, setCtaUrl] = useState(initial.portal_banner_cta_url ?? '');
  const [expiresOn, setExpiresOn] = useState(toDateInputValue(initial.portal_banner_expires_at));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    // Convert YYYY-MM-DD → end-of-day ISO timestamptz so the banner stays
    // visible for the entirety of the chosen day.
    const expires_at = expiresOn
      ? new Date(`${expiresOn}T23:59:59`).toISOString()
      : null;

    const { error } = await supabase
      .from('companies')
      .update({
        portal_banner_enabled: enabled,
        portal_banner_message: message.trim() || null,
        portal_banner_cta_label: ctaLabel.trim() || null,
        portal_banner_cta_url: ctaUrl.trim() || null,
        portal_banner_expires_at: expires_at,
      })
      .eq('id', companyId);
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? 'Portal banner saved and live.' : 'Portal banner saved (disabled).');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Show banner</p>
          <p className="text-xs text-muted-foreground">
            Top of every customer's portal home until expiration.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="banner-message" className="text-xs">Message</Label>
        <textarea
          id="banner-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Spring cleanup season is here — book by April 15 for 10% off."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="banner-cta-label" className="text-xs">CTA label (optional)</Label>
          <Input
            id="banner-cta-label"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Book now"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="banner-cta-url" className="text-xs">CTA link</Label>
          <Input
            id="banner-cta-url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="/portal/requests/new"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="banner-expires" className="text-xs">Expires</Label>
        <Input
          id="banner-expires"
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
          className="h-8 text-sm w-44"
        />
        <p className="text-[11px] text-muted-foreground">
          Leave blank for no expiration.
        </p>
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="gap-1.5"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save banner
      </Button>
    </div>
  );
}
