'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { PortalUser } from '@/types';

const PREF_LABELS: Array<{
  key: keyof PortalUser['notification_prefs'];
  label: string;
  sub: string;
  disabled?: boolean;
  disabledReason?: string;
}> = [
  { key: 'email_job_reminder', label: 'Job Scheduled', sub: 'Email when a new job is scheduled for your property' },
  { key: 'email_invoice', label: 'Invoice Ready', sub: 'Email when a new invoice is available' },
  { key: 'email_request_update', label: 'Request Updates', sub: 'Email when your service request status changes' },
  { key: 'sms_crew_enroute', label: 'Crew En Route (SMS)', sub: 'Text when our crew is on the way', disabled: true, disabledReason: 'Coming soon' },
];

export default function PortalSettingsPage() {
  const supabase = createClient();
  const [pu, setPu] = useState<PortalUser | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await supabase.from('portal_users').select('*').eq('id', user.id).single();
      if (data) setPu(data as PortalUser);
      setLoading(false);
    }
    load();
  }, []);

  async function togglePref(key: keyof PortalUser['notification_prefs'], value: boolean) {
    if (!pu) return;
    const newPrefs = { ...pu.notification_prefs, [key]: value };
    setSaving(true);
    const { error } = await supabase
      .from('portal_users')
      .update({ notification_prefs: newPrefs })
      .eq('id', pu.id);
    if (error) {
      toast.error('Failed to save preference.');
    } else {
      setPu((prev) => prev ? { ...prev, notification_prefs: newPrefs } : prev);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Profile section */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Profile</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="text-sm font-medium text-gray-800">{pu?.full_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm text-gray-800">{email}</p>
          </div>
          {pu?.phone && (
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="text-sm text-gray-800">{pu.phone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Notification preferences */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notifications</p>
        </div>
        <div className="divide-y">
          {PREF_LABELS.map(({ key, label, sub, disabled, disabledReason }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3.5 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  {disabled && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      {disabledReason}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </div>
              <Switch
                checked={pu?.notification_prefs?.[key] ?? false}
                onCheckedChange={(v) => togglePref(key, v)}
                disabled={disabled || saving}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400">
        To update your email or cancel your account, contact TLC directly.
      </p>
    </div>
  );
}
