'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, Check, Clipboard, Loader2, Mail, MessageSquare,
  Send, Smartphone, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_INVITE_TEMPLATE, DEFAULT_EMAIL_SUBJECT,
  buildSmsUrl, buildMailtoUrl, formatPhone, renderInvite,
  type InviteVars,
} from '@/lib/invite-templates';
import type { Crew, Profile } from '@/types';

interface Props {
  /** Triggers the sheet — caller can wrap any element. Optional;
   *  exposing `open`/`onOpenChange` lets callers control externally. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CrewMemberRow = {
  profile_id: string;
  crew_id: string;
  profile: Pick<Profile, 'id' | 'full_name' | 'phone' | 'role' | 'last_signin_at' | 'invited_at'> & { email?: string | null };
};

type Step = 'pick' | 'method' | 'preview' | 'sent';
type Method = 'sms' | 'email' | 'copy';

export function SendAppToWorker({ trigger, open: controlledOpen, onOpenChange }: Props) {
  const supabase = createClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };

  const [step, setStep] = useState<Step>('pick');
  const [tab, setTab] = useState<'existing' | 'new'>('existing');

  const [crews, setCrews] = useState<Crew[]>([]);
  const [members, setMembers] = useState<CrewMemberRow[]>([]);
  const [companyName, setCompanyName] = useState('TLC Landscape Management');
  const [senderName, setSenderName] = useState('Dispatch');

  // Existing-member selection
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // New-member form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCrewId, setNewCrewId] = useState('');
  const [newHourly, setNewHourly] = useState('');
  const [creating, setCreating] = useState(false);

  // Outcome of step 1: the worker we'll send the invite to
  const [target, setTarget] = useState<{
    full_name: string;
    email: string;
    phone: string | null;
    password: string | null; // null when picking existing — only known for fresh creates
    profile_id: string;
  } | null>(null);

  // Step 2/3
  const [method, setMethod] = useState<Method>('sms');
  const [messageBody, setMessageBody] = useState(DEFAULT_INVITE_TEMPLATE);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);

  const appUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://greenops-rho.vercel.app';
    return window.location.origin;
  }, []);

  // Load existing crew members + crews + sender info on first open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name, company_id, company:companies(name)')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      const sp = senderProfile as { full_name?: string; company?: { name?: string } | null } | null;
      const first = (sp?.full_name ?? '').split(' ')[0] || 'Dispatch';
      setSenderName(first);
      if (sp?.company?.name) setCompanyName(sp.company.name);

      const [{ data: crewRows }, { data: memberRows }] = await Promise.all([
        supabase.from('crews').select('*').eq('is_active', true).order('name'),
        supabase
          .from('crew_members')
          .select('profile_id, crew_id, profile:profiles(id,full_name,phone,role,last_signin_at,invited_at)')
          .order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setCrews((crewRows ?? []) as Crew[]);
      setMembers(((memberRows ?? []) as unknown) as CrewMemberRow[]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setStep('pick');
    setTab('existing');
    setSelectedProfileId('');
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewCrewId('');
    setNewHourly('');
    setTarget(null);
    setMethod('sms');
    setMessageBody(DEFAULT_INVITE_TEMPLATE);
    setEmailSubject(DEFAULT_EMAIL_SUBJECT);
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  // Render the live message preview using whichever target we have.
  const previewVars: InviteVars | null = target
    ? {
        worker: target.full_name.split(' ')[0],
        sender: senderName,
        company: companyName,
        appUrl,
        email: target.email || '(no email on file)',
        password: target.password ?? '(ask the worker to use Forgot Password)',
      }
    : null;
  const previewBody = previewVars ? renderInvite(messageBody, previewVars) : '';
  const previewSubject = previewVars ? renderInvite(emailSubject, previewVars) : '';

  async function continueWithExisting() {
    const member = members.find((m) => m.profile_id === selectedProfileId);
    if (!member) {
      toast.error('Pick a crew member.');
      return;
    }
    // Existing members may not have an email on the profile (we don't store
    // it there); fetching from auth.users requires admin access. The dispatcher
    // can edit the rendered template if the address is wrong.
    setTarget({
      full_name: member.profile?.full_name ?? 'Crew member',
      email: '',
      phone: member.profile?.phone ?? null,
      password: null,
      profile_id: member.profile_id,
    });
    setStep('method');
  }

  async function continueWithNew() {
    if (!newName.trim() || !newEmail.trim() || !newCrewId) {
      toast.error('Name, email, and crew are required.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/invite-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim() || null,
          crew_id: newCrewId,
          hourly_rate: newHourly ? Number(newHourly) : null,
          hire_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Failed to create worker.');
        return;
      }
      setTarget({
        full_name: json.full_name,
        email: json.email,
        phone: newPhone.trim() || null,
        password: json.password,
        profile_id: json.profile_id,
      });
      setStep('method');
    } catch (err) {
      toast.error((err as Error).message ?? 'Network error');
    } finally {
      setCreating(false);
    }
  }

  function send() {
    if (!previewVars) return;
    if (method === 'sms') {
      if (!target?.phone) {
        toast.error('No phone number on file.');
        return;
      }
      const url = buildSmsUrl(target.phone, previewBody);
      window.location.href = url;
      setStep('sent');
    } else if (method === 'email') {
      if (!target?.email) {
        toast.error('No email on file.');
        return;
      }
      window.location.href = buildMailtoUrl(target.email, previewSubject, previewBody);
      setStep('sent');
    } else {
      // Copy to clipboard
      const text = previewBody;
      if (typeof navigator.clipboard?.writeText === 'function') {
        navigator.clipboard.writeText(text).then(
          () => { toast.success('Copied!'); setStep('sent'); },
          () => toast.error('Clipboard write failed.'),
        );
      } else {
        toast.error('Clipboard API not available.');
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      {trigger}
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Send App to Worker
          </SheetTitle>
          <SheetDescription>
            Get a crew member up and running on their phone in under a minute.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {step === 'pick' && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
                {([
                  { id: 'existing' as const, label: 'Existing crew member', Icon: Users },
                  { id: 'new' as const, label: 'New crew member', Icon: UserPlus },
                ]).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                      tab === id ? 'text-white shadow' : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={tab === id ? { backgroundColor: 'var(--orange)' } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'existing' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pick a crew member</Label>
                    <Select value={selectedProfileId} onValueChange={(v) => setSelectedProfileId(v ?? '')}>
                      <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        {members.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                            No crew members yet — switch to <strong>New crew member</strong> to add one.
                          </div>
                        )}
                        {members.map((m) => {
                          const crewName = crews.find((c) => c.id === m.crew_id)?.name ?? 'No crew';
                          const status = inviteStatus(m);
                          return (
                            <SelectItem key={m.profile_id} value={m.profile_id}>
                              <span className="flex flex-col">
                                <span>{m.profile?.full_name ?? '(unnamed)'} <span className="text-muted-foreground">· {crewName}</span></span>
                                <span className="text-[10px] text-muted-foreground">{status}</span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={continueWithExisting}
                    disabled={!selectedProfileId}
                    className="w-full text-white"
                    style={{ backgroundColor: 'var(--orange)' }}
                  >
                    Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              )}

              {tab === 'new' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="iw-name" className="text-xs">Full name *</Label>
                      <Input id="iw-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Carlos Mendez" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="iw-phone" className="text-xs">Phone *</Label>
                      <Input
                        id="iw-phone"
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                        placeholder="509-555-0123"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="iw-email" className="text-xs">Email *</Label>
                      <Input id="iw-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="carlos@example.com" />
                      <p className="text-[10px] text-muted-foreground">Used to log in and reset password.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Assign to crew *</Label>
                      <Select value={newCrewId} onValueChange={(v) => setNewCrewId(v ?? '')}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {crews.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="iw-rate" className="text-xs">Hourly rate (optional)</Label>
                      <Input
                        id="iw-rate"
                        type="number"
                        step="0.5"
                        min="0"
                        value={newHourly}
                        onChange={(e) => setNewHourly(e.target.value)}
                        placeholder="25"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={continueWithNew}
                    disabled={creating}
                    className="w-full text-white gap-1.5"
                    style={{ backgroundColor: 'var(--orange)' }}
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Create + continue
                  </Button>
                </div>
              )}
            </>
          )}

          {step === 'method' && target && (
            <>
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                <p className="font-semibold">{target.full_name}</p>
                <p className="text-muted-foreground">
                  {target.email && <>📧 {target.email}</>}
                  {target.email && target.phone && ' · '}
                  {target.phone && <>📱 {formatPhone(target.phone)}</>}
                </p>
                {target.password && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Temp password generated: <strong className="text-foreground tabular-nums">{target.password}</strong>
                  </p>
                )}
              </div>

              <p className="text-xs font-semibold">How do you want to send the invite?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { id: 'sms' as const,   Icon: MessageSquare, label: 'Text message',  hint: 'Recommended' },
                  { id: 'email' as const, Icon: Mail,           label: 'Email',         hint: 'Backup' },
                  { id: 'copy' as const,  Icon: Clipboard,      label: 'Copy link',     hint: 'WhatsApp / Slack' },
                ]).map(({ id, Icon, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMethod(id)}
                    className={cn(
                      'rounded-lg border p-3 text-left flex flex-col gap-1 transition-all',
                      method === id ? 'shadow-md' : 'hover:bg-accent/30',
                    )}
                    style={method === id ? { borderColor: 'var(--orange)', backgroundColor: 'var(--orange-soft)' } : undefined}
                  >
                    <Icon className="h-4 w-4" style={method === id ? { color: 'var(--orange-deep)' } : { color: 'var(--orange)' }} />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('pick')} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStep('preview')}
                  className="gap-1.5 text-white"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  Preview <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {step === 'preview' && target && previewVars && (
            <>
              {method === 'email' && (
                <div className="space-y-1.5">
                  <Label htmlFor="iw-subject" className="text-xs">Subject</Label>
                  <Input
                    id="iw-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Preview: <span className="font-semibold">{previewSubject}</span>
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="iw-body" className="text-xs">Message</Label>
                <Textarea
                  id="iw-body"
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={10}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Variables in {'{{...}}'} fill in automatically when sent.
                </p>
              </div>

              <div className="rounded-lg border bg-card p-3 text-xs whitespace-pre-wrap font-mono leading-relaxed">
                {previewBody}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('method')} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  onClick={send}
                  className="gap-1.5 text-white"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send via {method === 'sms' ? 'SMS' : method === 'email' ? 'Email' : 'Clipboard'}
                </Button>
              </div>
            </>
          )}

          {step === 'sent' && target && (
            <div className="space-y-3">
              <div
                className="rounded-lg border px-4 py-3 flex items-start gap-3"
                style={{
                  backgroundColor: 'var(--orange-soft)',
                  borderColor: 'var(--orange)',
                  color: 'var(--orange-deep)',
                }}
              >
                <Check className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Invitation sent to {target.full_name}</p>
                  <p className="mt-1">What happens next:</p>
                  <ul className="mt-1 ml-4 list-disc">
                    <li>{target.full_name.split(' ')[0]} taps the link</li>
                    <li>Logs in with the credentials</li>
                    <li>Adds to home screen</li>
                    <li>Sees their first day&apos;s jobs</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { reset(); }}
                  className="flex-1"
                >
                  Send to another worker
                </Button>
                <Button
                  onClick={() => handleClose(false)}
                  className="flex-1 text-white"
                  style={{ backgroundColor: 'var(--orange)' }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function inviteStatus(m: CrewMemberRow): string {
  const lastSignin = m.profile?.last_signin_at ? new Date(m.profile.last_signin_at) : null;
  const invited = m.profile?.invited_at ? new Date(m.profile.invited_at) : null;
  if (!lastSignin) {
    return invited
      ? `🟡 Invited ${invited.toLocaleDateString()} — never signed in`
      : '🟡 Not yet invited';
  }
  const days = Math.floor((Date.now() - lastSignin.getTime()) / 86_400_000);
  if (days < 1) return '🟢 Active — signed in today';
  if (days < 7) return `🟢 Active — ${days}d ago`;
  return `🔴 Inactive — ${days}d since last sign-in`;
}
