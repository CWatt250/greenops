'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Loader2, Send, CloudSun } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { getAnnouncementWeather, type ForecastQuery } from '@/lib/weather';
import { suggestAnnouncement } from '@/lib/weather-suggestion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew } from '@/types';

/** Tri-Cities, WA — matches the dashboard weather fallback. */
const FALLBACK_LOCATION: ForecastQuery = { lat: 46.2087, lng: -119.1734 };

type Audience = 'all_crew' | 'crew_specific' | 'all_customers';

interface Props {
  /** The owner's company. Omit to self-resolve from the signed-in profile —
   *  used by the dashboard top-bar megaphone, which has no company in scope. */
  companyId?: string;
  /** `button` (default) renders the labelled outline button used on the
   *  dashboard; `icon` renders the orange circular megaphone tap target used
   *  in the mobile top bar. */
  variant?: 'button' | 'icon';
}

export function AnnounceButton({ companyId: companyIdProp, variant = 'button' }: Props) {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(companyIdProp ?? null);
  const [open, setOpen] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [audience, setAudience] = useState<Audience>('all_crew');
  const [crewId, setCrewId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  // When no company is passed in (top-bar usage), resolve it from the
  // signed-in user's profile so audience queries can be scoped.
  useEffect(() => {
    if (companyId) return;
    let cancelled = false;
    getCompanyContext(supabase).then((ctx) => {
      if (!cancelled && ctx) setCompanyId(ctx.companyId);
    });
    return () => { cancelled = true; };
  }, [companyId, supabase]);

  useEffect(() => {
    if (!open || !companyId) return;
    supabase
      .from('crews')
      .select('*')
      .eq('is_active', true)
      .eq('company_id', companyId)
      .order('name')
      .then(({ data }) => setCrews((data ?? []) as Crew[]));
  }, [open, companyId, supabase]);

  // Refresh recipient count whenever the audience picker changes.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      let count: number | null = null;
      if (audience === 'all_crew') {
        const { count: c } = await supabase
          .from('crew_members')
          .select('id, crew:crews!inner(company_id)', { count: 'exact', head: true })
          .eq('crew.company_id', companyId);
        count = c;
      } else if (audience === 'crew_specific') {
        if (!crewId) { count = null; }
        else {
          const { count: c } = await supabase
            .from('crew_members')
            .select('id', { count: 'exact', head: true })
            .eq('crew_id', crewId);
          count = c;
        }
      } else if (audience === 'all_customers') {
        const { count: c } = await supabase
          .from('portal_users')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId);
        count = c;
      }
      if (!cancelled) setRecipientCount(count);
    })();
    return () => { cancelled = true; };
  }, [audience, crewId, open, companyId, supabase]);

  function reset() {
    setAudience('all_crew');
    setCrewId('');
    setTitle('');
    setBody('');
    setRecipientCount(null);
  }

  // Fill the composer from current conditions at the company location. The
  // owner edits freely before sending — it's a starting point, not a send.
  async function suggestFromWeather() {
    setSuggesting(true);
    try {
      // Resolve the company's weather location the same way the dashboard does:
      // explicit lat/lng → city/state → Tri-Cities fallback.
      let query: ForecastQuery = FALLBACK_LOCATION;
      if (companyId) {
        const { data } = await supabase
          .from('companies')
          .select('weather_latitude, weather_longitude, city, state')
          .eq('id', companyId)
          .single();
        if (data?.weather_latitude != null && data?.weather_longitude != null) {
          query = { lat: Number(data.weather_latitude), lng: Number(data.weather_longitude) };
        } else if (data?.city) {
          query = { city: data.city as string, state: (data.state as string) ?? undefined };
        }
      }

      const input = await getAnnouncementWeather(query);
      if (!input) {
        toast.error('Weather unavailable — add a title manually.');
        return;
      }
      const suggestion = suggestAnnouncement(input);
      if (!suggestion) {
        toast('Conditions look clear — no weather suggestion. Schedule as normal.');
        return;
      }
      // Weather-ops messages default to crew; manual selection still works.
      setAudience(suggestion.audience);
      setTitle(suggestion.title);
      setBody(suggestion.body);
      toast.success('Filled from current weather — edit before sending.');
    } catch {
      toast.error('Could not fetch weather — add a title manually.');
    } finally {
      setSuggesting(false);
    }
  }

  async function send() {
    if (!companyId) { toast.error('Still loading — try again in a moment.'); return; }
    if (!title.trim()) { toast.error('Add a title.'); return; }
    if (audience === 'crew_specific' && !crewId) {
      toast.error('Pick a crew.');
      return;
    }
    setSending(true);

    if (audience === 'all_customers') {
      // Fan out to portal_notifications, one row per portal user.
      const { data: portalUsers } = await supabase
        .from('portal_users')
        .select('id')
        .eq('company_id', companyId);
      const rows = (portalUsers ?? []).map((u: { id: string }) => ({
        portal_user_id: u.id,
        title: title.trim(),
        body: body.trim() || null,
        type: 'broadcast' as const,
        entity_type: null,
        entity_id: null,
      }));
      if (rows.length === 0) {
        setSending(false);
        toast.error('No portal customers to notify.');
        return;
      }
      const { error } = await supabase.from('portal_notifications').insert(rows);
      setSending(false);
      if (error) { toast.error(error.message); return; }
      toast.success(`Announcement sent to ${rows.length} customer${rows.length === 1 ? '' : 's'}.`);
      setOpen(false);
      reset();
      return;
    }

    // Crew audience — fan out to internal notifications keyed by profile_id.
    let memberQuery = supabase
      .from('crew_members')
      .select('profile_id, crew:crews!inner(company_id)');
    memberQuery = memberQuery.eq('crew.company_id', companyId);
    if (audience === 'crew_specific') {
      memberQuery = memberQuery.eq('crew_id', crewId);
    }
    const { data: members, error: membersErr } = await memberQuery;
    if (membersErr) {
      setSending(false);
      toast.error(membersErr.message);
      return;
    }
    // De-duplicate profile_ids (a member might be on multiple crews when
    // audience=all_crew).
    const profileIds = Array.from(new Set(
      (members ?? []).map((m: { profile_id: string }) => m.profile_id).filter(Boolean)
    ));
    if (profileIds.length === 0) {
      setSending(false);
      toast.error('No crew members to notify.');
      return;
    }
    const rows = profileIds.map((pid) => ({
      company_id: companyId,
      profile_id: pid,
      title: title.trim(),
      body: body.trim() || null,
      entity_type: 'broadcast',
      entity_id: null,
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    setSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Announcement sent to ${rows.length} crew member${rows.length === 1 ? '' : 's'}.`);
    setOpen(false);
    reset();
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Announcements"
          title="Send an announcement"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
          style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'var(--orange)' }}
        >
          <Megaphone className="h-4 w-4" />
        </button>
      ) : (
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          className="gap-1.5"
          title="Send a message to crews or customers"
        >
          <Megaphone className="h-4 w-4" />
          Announce
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Send an announcement</SheetTitle>
            <SheetDescription>
              Push a one-off message to crews or customers. They'll see it
              in their notification bell on next sign-in.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Audience</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { v: 'all_crew', label: 'All crew' },
                  { v: 'crew_specific', label: 'One crew' },
                  { v: 'all_customers', label: 'All customers' },
                ] as { v: Audience; label: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setAudience(opt.v)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors',
                      audience === opt.v
                        ? 'border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-deep)]'
                        : 'bg-background text-muted-foreground hover:border-foreground/30'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {audience === 'crew_specific' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Crew</Label>
                <Select value={crewId} onValueChange={(v) => setCrewId(v ?? '')}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Pick a crew…" />
                  </SelectTrigger>
                  <SelectContent>
                    {crews.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ann-title" className="text-xs">Title *</Label>
                <button
                  type="button"
                  onClick={suggestFromWeather}
                  disabled={suggesting}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--orange-deep)] hover:underline disabled:opacity-50"
                  title="Fill from current conditions at your location"
                >
                  {suggesting
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CloudSun className="h-3 w-3" />}
                  Suggest from weather
                </button>
              </div>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Rain delay — start at 10am today"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body" className="text-xs">Body (optional)</Label>
              <textarea
                id="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Any extra detail. Shown under the title."
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {recipientCount === null
                ? '—'
                : recipientCount === 0
                  ? `No one to notify — this audience has no ${audience === 'all_customers' ? 'customers' : 'crew members'} yet.`
                  : `Will reach ${recipientCount} ${audience === 'all_customers' ? 'customer' : 'crew member'}${recipientCount === 1 ? '' : 's'}.`}
            </p>

            <Button
              onClick={send}
              disabled={sending || recipientCount === 0 || !title.trim() || (audience === 'crew_specific' && !crewId)}
              className="w-full gap-1.5"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {sending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              Send announcement
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
