'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Plus, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MemberRateRow } from '@/components/crews/member-rate-row';
import { toast } from 'sonner';
import type { Crew, CrewMember, Profile } from '@/types';

type Member = CrewMember & { profile: Profile | null };

export default function CrewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pickProfileId, setPickProfileId] = useState('');
  const [pickRole, setPickRole] = useState<'lead' | 'member'>('member');
  const [savingMember, setSavingMember] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);

  async function load() {
    setLoading(true);
    const { data: crewRes } = await supabase
      .from('crews')
      .select('*')
      .eq('id', id)
      .single();
    if (!crewRes) { setLoading(false); return; }
    setCrew(crewRes as Crew);

    const [membersRes, profilesRes] = await Promise.all([
      supabase
        .from('crew_members')
        .select('*, hourly_rate, labor_burden_pct, profile:profiles(*)')
        .eq('crew_id', id)
        .order('role'),
      supabase
        .from('profiles')
        .select('*')
        .eq('company_id', (crewRes as { company_id: string }).company_id)
        .order('full_name'),
    ]);

    const memberRows = (membersRes.data ?? []) as Member[];
    setMembers(memberRows);

    // Available = company profiles not already on this crew.
    const memberProfileIds = new Set(memberRows.map((m) => m.profile_id));
    const allProfiles = (profilesRes.data ?? []) as Profile[];
    setAvailableProfiles(allProfiles.filter((p) => !memberProfileIds.has(p.id)));

    setLoading(false);
  }

  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  async function addMember() {
    if (!pickProfileId) { toast.error('Pick a profile.'); return; }
    if (!crew) return;
    setSavingMember(true);
    const { error } = await supabase.from('crew_members').insert({
      crew_id: crew.id,
      profile_id: pickProfileId,
      role: pickRole,
      hourly_rate: 25,
      labor_burden_pct: 25,
    });
    setSavingMember(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Member added.');
    setAdding(false);
    setPickProfileId('');
    setPickRole('member');
    load();
  }

  async function removeMember(m: Member) {
    const { error } = await supabase.from('crew_members').delete().eq('id', m.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Member removed.');
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!crew) {
    return (
      <p className="text-sm text-muted-foreground text-center py-16">Crew not found.</p>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/crews"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Crews
      </Link>

      <div className="flex items-center gap-3 mb-6 pb-4 border-b">
        <span
          className="h-5 w-5 rounded-full shrink-0"
          style={{ backgroundColor: crew.color }}
        />
        <div className="flex-1">
          <h1 className="page-title" style={{ fontSize: 28 }}>{crew.name}</h1>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length === 1 ? '' : 's'}
            {crew.is_active === false && ' · inactive'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold">Members</p>
          {!adding && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add member
            </Button>
          )}
        </div>

        {members.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic px-4 py-8 text-center">
            No members yet. Click <strong>Add member</strong> to assign someone.
          </p>
        )}

        {members.length > 0 && (
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="relative">
                <MemberRateRow member={m} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-3 top-3 h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmRemove(m)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {adding && (
          <div className="border-t bg-muted/20 p-4 space-y-3">
            {availableProfiles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Every company profile is already on this crew. Invite more
                team members from <strong>Settings</strong> first.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Profile</Label>
                  <Select value={pickProfileId} onValueChange={(v) => setPickProfileId(v ?? '')}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pick a profile…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name ?? p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={pickRole} onValueChange={(v) => setPickRole((v ?? 'member') as 'lead' | 'member')}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={addMember}
                    disabled={savingMember || !pickProfileId}
                    className="gap-1.5"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    {savingMember
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Plus className="h-3.5 w-3.5" />}
                    Add to crew
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setAdding(false); setPickProfileId(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}
        title={`Remove ${confirmRemove?.profile?.full_name ?? 'member'}?`}
        description="They'll no longer appear on this crew. Past job assignments and clock events stay intact."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (confirmRemove) await removeMember(confirmRemove); }}
      />
    </div>
  );
}
