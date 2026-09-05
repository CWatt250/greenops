'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader2, UserPlus, Mail, UserX, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Role = 'owner' | 'dispatcher' | 'crew';
interface Member { id: string; full_name: string | null; email: string | null; phone: string | null; role: Role; is_active: boolean; last_signin_at: string | null; invited_at: string | null; crews: string[] }

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', dispatcher: 'Dispatcher', crew: 'Crew' };

/** Settings → Team: invite, change roles, deactivate, resend sign-in links. */
export function TeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role>('dispatcher');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState({ full_name: '', email: '', role: 'crew' as Role });
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/team');
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) { toast.error(json.error ?? 'Could not load the team.'); setLoading(false); return; }
      setMembers(json.members ?? []); setMeId(json.me); setMyRole(json.myRole); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function post(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? 'Something went wrong.'); return null; }
      return json;
    } finally { setBusy(null); }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const json = await post({ action: 'invite', ...invite }, 'invite');
    if (!json) return;
    if (json.emailed) toast.success(`Invite emailed to ${invite.email}.`);
    else if (json.tempPassword) { setTempPassword({ email: invite.email, password: json.tempPassword }); toast.message('Account created — share the temporary password below.'); }
    else toast.message('Account created, but the invite email could not be sent. Use "Resend link".');
    setInvite({ full_name: '', email: '', role: 'crew' });
    void load();
  }

  const isOwner = myRole === 'owner';

  return (
    <div className="space-y-5">
      <form onSubmit={sendInvite} className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-2 text-sm font-medium"><UserPlus className="mr-1.5 inline h-4 w-4" />Invite someone</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_140px_auto]">
          <div><Label htmlFor="inv-name" className="sr-only">Full name</Label><Input id="inv-name" placeholder="Full name" value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} required /></div>
          <div><Label htmlFor="inv-email" className="sr-only">Email</Label><Input id="inv-email" type="email" placeholder="email@example.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></div>
          <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: (v ?? 'crew') as Role })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="crew">Crew</SelectItem>
              {isOwner && <SelectItem value="dispatcher">Dispatcher</SelectItem>}
              {isOwner && <SelectItem value="owner">Owner</SelectItem>}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" className="h-9" disabled={busy === 'invite'}>{busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send invite'}</Button>
        </div>
        {tempPassword && (
          <p className="mt-2 rounded-md bg-background px-3 py-2 text-xs">
            Email delivery isn&rsquo;t configured, so share this with {tempPassword.email} directly: temporary password <code className="font-mono font-semibold">{tempPassword.password}</code>. They can change it in Settings.
          </p>
        )}
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Loading team…</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {members.map((m) => {
            const self = m.id === meId;
            return (
              <li key={m.id} className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between', !m.is_active && 'opacity-60')}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.full_name ?? '—'}{self && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                    {!m.is_active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Deactivated</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email ?? 'no email'}{m.crews.length ? ` · ${m.crews.join(', ')}` : ''}{m.last_signin_at ? ` · last sign-in ${new Date(m.last_signin_at).toLocaleDateString()}` : m.invited_at ? ' · invited, never signed in' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {isOwner && !self ? (
                    <Select value={m.role} onValueChange={async (v) => { if (!v || v === m.role) return; const ok = await post({ action: 'role', id: m.id, role: v }, `role-${m.id}`); if (ok) { toast.success(`${m.full_name ?? 'Member'} is now ${ROLE_LABEL[v as Role].toLowerCase()}.`); void load(); } }}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="dispatcher">Dispatcher</SelectItem>
                        <SelectItem value="crew">Crew</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{ROLE_LABEL[m.role]}</span>
                  )}
                  {m.is_active && m.email && (
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={busy === `resend-${m.id}`} onClick={async () => { const ok = await post({ action: 'resend', id: m.id }, `resend-${m.id}`); if (ok?.emailed) toast.success(`Sign-in link sent to ${m.email}.`); }} title="Email a fresh sign-in link">
                      {busy === `resend-${m.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}<span className="ml-1 hidden sm:inline">Resend link</span>
                    </Button>
                  )}
                  {isOwner && !self && (m.is_active ? (
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setConfirm(m)} title="Deactivate">
                      <UserX className="h-3.5 w-3.5" /><span className="ml-1 hidden sm:inline">Deactivate</span>
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={busy === `react-${m.id}`} onClick={async () => { const ok = await post({ action: 'reactivate', id: m.id }, `react-${m.id}`); if (ok) { toast.success(`${m.full_name ?? 'Member'} reactivated.`); void load(); } }}>
                      {busy === `react-${m.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}<span className="ml-1 hidden sm:inline">Reactivate</span>
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={`Deactivate ${confirm?.full_name ?? 'this account'}?`}
        description="They will be signed out and can no longer sign in. Their jobs, punches, and history stay. You can reactivate them any time."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => { if (!confirm) return; const ok = await post({ action: 'deactivate', id: confirm.id }, `deact-${confirm.id}`); setConfirm(null); if (ok) { toast.success('Account deactivated.'); void load(); } }}
      />
    </div>
  );
}
