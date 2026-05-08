'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Loader2, Send } from 'lucide-react';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew } from '@/types';

type Audience = 'all_crew' | 'crew_specific' | 'all_customers';

interface Props {
  companyId: string;
}

export function AnnounceButton({ companyId }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [audience, setAudience] = useState<Audience>('all_crew');
  const [crewId, setCrewId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
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
    if (!open) return;
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

  async function send() {
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
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Megaphone className="h-4 w-4" />
        Announce
      </Button>

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
              <Label htmlFor="ann-title" className="text-xs">Title *</Label>
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
                : `Will reach ${recipientCount} ${audience === 'all_customers' ? 'customer' : 'crew member'}${recipientCount === 1 ? '' : 's'}.`}
            </p>

            <Button
              onClick={send}
              disabled={sending || !title.trim() || (audience === 'crew_specific' && !crewId)}
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
