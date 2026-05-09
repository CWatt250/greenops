'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ChevronLeft, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { ApplicatorLicense } from '@/types';

interface ProfileWithLicenses {
  id: string;
  full_name?: string | null;
  email?: string | null;
  licenses: ApplicatorLicense[];
}

function expirationStatus(date: string | null | undefined): 'expired' | 'expiring' | 'ok' | 'none' {
  if (!date) return 'none';
  const now = new Date();
  const exp = new Date(date);
  const diff = exp.getTime() - now.getTime();
  if (diff < 0) return 'expired';
  if (diff < 30 * 24 * 3600 * 1000) return 'expiring';
  return 'ok';
}

export default function LicensesPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<ProfileWithLicenses[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApplicatorLicense | null>(null);

  // Form state for the inline-add row
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) { setLoading(false); return; }

    const [profilesRes, licensesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId)
        .order('full_name'),
      supabase
        .from('applicator_licenses')
        .select('*')
        .order('expiration_date', { ascending: true }),
    ]);

    const licenses = (licensesRes.data ?? []) as ApplicatorLicense[];
    const merged: ProfileWithLicenses[] = (profilesRes.data ?? []).map(
      (p: { id: string; full_name?: string | null; email?: string | null }) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        licenses: licenses.filter((l) => l.profile_id === p.id),
      })
    );
    setProfiles(merged);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addLicense(profileId: string) {
    if (!licenseNumber.trim()) { toast.error('License number required.'); return; }
    setSaving(true);
    const { error } = await supabase.from('applicator_licenses').insert({
      profile_id: profileId,
      license_number: licenseNumber.trim(),
      license_type: licenseType.trim() || null,
      state: 'WA',
      issued_date: issuedDate || null,
      expiration_date: expirationDate || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('License added.');
    setAdding(null);
    setLicenseNumber(''); setLicenseType(''); setIssuedDate(''); setExpirationDate('');
    load();
  }

  async function handleDelete(l: ApplicatorLicense) {
    const { error } = await supabase.from('applicator_licenses').delete().eq('id', l.id);
    if (error) { toast.error(error.message); return; }
    toast.success('License removed.');
    load();
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Settings
      </Link>
      <PageHeader title="Applicator licenses" description="Track WA state pesticide-applicator licenses per crew member." />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-3">
          {profiles.map((p) => {
            const isAdding = adding === p.id;
            return (
              <li key={p.id} className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.full_name ?? p.email ?? 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">{p.email}</p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setAdding(isAdding ? null : p.id)}
                    className="gap-1.5"
                  >
                    <Plus className="h-3 w-3" /> {isAdding ? 'Cancel' : 'Add license'}
                  </Button>
                </div>

                {p.licenses.length > 0 && (
                  <ul className="space-y-1">
                    {p.licenses.map((l) => {
                      const status = expirationStatus(l.expiration_date);
                      return (
                        <li
                          key={l.id}
                          className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs"
                        >
                          <span className="font-mono font-semibold">{l.license_number}</span>
                          {l.license_type && (
                            <span className="text-muted-foreground">· {l.license_type}</span>
                          )}
                          <span className="text-muted-foreground">· {l.state}</span>
                          {l.expiration_date && (
                            <span className={
                              status === 'expired'
                                ? 'inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-bold'
                                : status === 'expiring'
                                  ? 'inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-bold'
                                  : 'text-muted-foreground'
                            }>
                              {status !== 'ok' && <AlertTriangle className="h-3 w-3" />}
                              Expires {l.expiration_date}
                            </span>
                          )}
                          <Button
                            variant="ghost" size="sm"
                            className="ml-auto h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDelete(l)}
                            title="Remove license"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isAdding && (
                  <div className="rounded-md border-dashed border bg-background p-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase tracking-wide">License number *</Label>
                      <Input
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide">Type</Label>
                      <Input
                        value={licenseType}
                        onChange={(e) => setLicenseType(e.target.value)}
                        placeholder="Commercial Operator"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide">Issued</Label>
                      <Input
                        type="date" value={issuedDate}
                        onChange={(e) => setIssuedDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase tracking-wide">Expiration</Label>
                      <Input
                        type="date" value={expirationDate}
                        onChange={(e) => setExpirationDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      onClick={() => addLicense(p.id)}
                      disabled={saving || !licenseNumber.trim()}
                      className="col-span-2"
                      style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                    >
                      {saving ? 'Saving…' : 'Add license'}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Remove license?"
        description="This deletes the license record. Past chemical applications stay intact."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}
