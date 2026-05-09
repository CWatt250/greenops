'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Phone, Mail, MapPin, Clock, Globe } from 'lucide-react';
import type { Company, PortalUser } from '@/types';

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

const DAY_ORDER: Array<keyof NonNullable<Company['business_hours']>> = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function PortalSettingsPage() {
  const supabase = createClient();
  const [pu, setPu] = useState<PortalUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await supabase.from('portal_users').select('*').eq('id', user.id).single();
      if (data) {
        const portalUser = data as PortalUser;
        setPu(portalUser);
        if (portalUser.company_id) {
          const { data: cRow } = await supabase
            .from('companies').select('*').eq('id', portalUser.company_id).single();
          if (cRow) setCompany(cRow as Company);
        }
      }
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

      {/* About / contact card */}
      {company && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              About {company.name}
            </p>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm">
            {company.tagline && (
              <p className="italic text-gray-600">&ldquo;{company.tagline}&rdquo;</p>
            )}
            {(company.address || company.city) && (
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="text-gray-700">
                  {company.address && <p>{company.address}</p>}
                  {(company.city || company.state || company.zip) && (
                    <p>
                      {[company.city, company.state].filter(Boolean).join(', ')}
                      {company.zip ? ` ${company.zip}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
            {company.phone && (
              <a
                href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                className="flex items-center gap-2.5 text-gray-700 hover:text-orange-600"
              >
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                {company.phone}
              </a>
            )}
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                className="flex items-center gap-2.5 text-gray-700 hover:text-orange-600 break-all"
              >
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                {company.email}
              </a>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-gray-700 hover:text-orange-600 break-all"
              >
                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
            {company.service_area && (
              <p className="text-xs text-gray-500 pt-1 border-t">
                Service area: {company.service_area}
              </p>
            )}
            {company.business_hours && Object.keys(company.business_hours).length > 0 && (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Hours
                  </p>
                </div>
                <ul className="space-y-1 text-xs text-gray-700">
                  {DAY_ORDER.map((day) => {
                    const hours = company.business_hours?.[day];
                    if (!hours) return null;
                    return (
                      <li key={day} className="flex justify-between gap-3">
                        <span className="text-gray-500 w-12">{DAY_LABELS[day]}</span>
                        <span className="text-right">{hours}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        To update your email or cancel your account, contact{' '}
        {company?.name ?? 'us'} {company?.email ? <>at {company.email}</> : null}.
      </p>
    </div>
  );
}
