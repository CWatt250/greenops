'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Copy, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { US_TIMEZONES } from '@/lib/tz';

interface Props {
  companyId: string;
  slug: string;
  initial: { timezone: string | null; review_url: string | null; public_requests_enabled: boolean | null };
  /** Resolved on the server from env — never expose the keys themselves. */
  channels: { email: boolean; sms: boolean };
}

/**
 * Settings → Customer communication: the public quote-request link, the
 * review link used by the post-job review request, the company timezone
 * that drives reminder/review timing, and which channels are live.
 */
export function CommunicationForm({ companyId, slug, initial, channels }: Props) {
  const supabase = createClient();
  const [timezone, setTimezone] = useState(initial.timezone ?? 'America/Los_Angeles');
  const [reviewUrl, setReviewUrl] = useState(initial.review_url ?? '');
  const [publicRequests, setPublicRequests] = useState(initial.public_requests_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/request/${slug}` : `/request/${slug}`;

  async function save() {
    if (reviewUrl && !/^https?:\/\//i.test(reviewUrl)) { toast.error('Review link must start with http:// or https://'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ timezone, review_url: reviewUrl.trim() || null, public_requests_enabled: publicRequests })
      .eq('id', companyId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Communication settings saved.');
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(publicUrl); toast.success('Link copied — put it on your website or a QR code.'); }
    catch { toast.message(publicUrl); }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <p className="rounded-md border px-3 py-2"><span className={channels.email ? 'text-green-700 font-semibold' : 'text-muted-foreground font-semibold'}>Email {channels.email ? 'on' : 'off'}</span> · resets, invites, proposals, invoices, reminders, review requests</p>
        <p className="rounded-md border px-3 py-2"><span className={channels.sms ? 'text-green-700 font-semibold' : 'text-muted-foreground font-semibold'}>SMS {channels.sms ? 'on' : 'off'}</span> · on-my-way texts and reminders for customers who opted in{channels.sms ? '' : ' (add Twilio keys to enable)'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Public quote-request page</Label>
            <p className="text-xs text-muted-foreground">Anyone can request a quote here without an account. Submissions show up in Portal Inbox → Requests as leads.</p>
          </div>
          <Switch checked={publicRequests} onCheckedChange={(v) => setPublicRequests(!!v)} aria-label="Enable public request page" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={publicUrl} className="font-mono text-xs" aria-label="Public request link" />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyLink} className="h-9"><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</Button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open</a>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-url">Review link (Google, Yelp, Facebook…)</Label>
        <Input id="review-url" type="url" placeholder="https://g.page/r/…/review" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground">When set, customers get a &ldquo;How did we do?&rdquo; email (or text, if opted in) within an hour of each completed job, once per job, 8 AM–8 PM only.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Company timezone</Label>
        <Select value={timezone} onValueChange={(v) => setTimezone(v ?? 'America/Los_Angeles')}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Timezone" /></SelectTrigger>
          <SelectContent>
            {US_TIMEZONES.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Drives &ldquo;tomorrow&rdquo; for appointment reminders and the quiet hours for review requests.</p>
      </div>

      <Button type="button" onClick={save} disabled={saving} size="sm">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save communication settings
      </Button>
    </div>
  );
}
