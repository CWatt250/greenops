'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearCompanyContext } from '@/lib/company-context';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Phone, Mail, MapPin, Clock, Globe, LogOut, Save } from 'lucide-react';
import type { Company, PortalUser } from '@/types';

const PREF_LABELS: Array<{
  key: keyof PortalUser['notification_prefs'];
  label: string;
  sub: string;
  disabled?: boolean;
  disabledReason?: string;
}> = [
  // Each toggle is read by a real producer: reminders cron, invoice send,
  // en-route + reminder SMS, review-request cron. Request-update emails stay
  // off until that producer moves server-side.
  { key: 'email_job_reminder', label: 'Appointment Reminders', sub: 'Email the day before a scheduled visit' },
  { key: 'email_invoice', label: 'Invoice Ready', sub: 'Email when a new invoice is available' },
  { key: 'email_review_request', label: 'Review Requests', sub: 'A quick "how did we do?" after each visit' },
  { key: 'email_request_update', label: 'Request Updates', sub: 'Email when your service request or reported issue changes status' },
  { key: 'sms_crew_enroute', label: 'Text Messages (SMS)', sub: 'On-my-way texts and reminders. Msg & data rates may apply; reply STOP to opt out.' },
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
  const router = useRouter();
  const [pu, setPu] = useState<PortalUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Editable profile state
  const [phoneEdit, setPhoneEdit] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [emailEdit, setEmailEdit] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailPending, setEmailPending] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      setEmailEdit(user.email ?? '');
      const { data } = await supabase.from('portal_users').select('*').eq('id', user.id).single();
      if (data) {
        const portalUser = data as PortalUser;
        setPu(portalUser);
        setPhoneEdit(portalUser.phone ?? '');
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

  async function savePhone() {
    if (!pu) return;
    setPhoneSaving(true);
    const { error } = await supabase
      .from('portal_users')
      .update({ phone: phoneEdit.trim() || null })
      .eq('id', pu.id);
    setPhoneSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPu((prev) => prev ? { ...prev, phone: phoneEdit.trim() || null } : prev);
    toast.success('Phone updated.');
  }

  async function saveEmail() {
    if (!emailEdit.trim() || emailEdit.trim() === email) return;
    setEmailSaving(true);
    // Supabase sends a confirmation link to the new address; the email
    // doesn't actually change until the user clicks it.
    const { error } = await supabase.auth.updateUser({ email: emailEdit.trim() });
    setEmailSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmailPending(true);
    toast.success('Verification email sent. Click the link to confirm the change.');
  }

  async function handleSignOut() {
    setSigningOut(true);
    clearCompanyContext();
    await supabase.auth.signOut();
    router.push('/login');
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
        <div className="px-4 py-4 space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Name</Label>
            <p className="text-sm font-medium text-gray-800 mt-0.5">{pu?.full_name ?? '—'}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ps-phone" className="text-xs text-gray-500">Phone</Label>
            <div className="flex gap-2">
              <Input
                id="ps-phone"
                type="tel"
                value={phoneEdit}
                onChange={(e) => setPhoneEdit(e.target.value)}
                placeholder="509-555-0123"
                className="flex-1 h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={savePhone}
                disabled={phoneSaving || phoneEdit.trim() === (pu?.phone ?? '')}
                className="gap-1 text-white"
                style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
              >
                {phoneSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ps-email" className="text-xs text-gray-500">Email</Label>
            <div className="flex gap-2">
              <Input
                id="ps-email"
                type="email"
                value={emailEdit}
                onChange={(e) => setEmailEdit(e.target.value)}
                className="flex-1 h-9 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveEmail}
                disabled={emailSaving || !emailEdit.trim() || emailEdit.trim() === email}
              >
                {emailSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Change'}
              </Button>
            </div>
            {emailPending && (
              <p className="text-[11px] text-amber-600">
                ✉️ Verification email sent — click the link to confirm. Your old address still works until then.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs text-gray-500">Service address</Label>
            <p className="text-sm text-gray-800 mt-0.5">
              Contact {company?.name ?? 'us'} to update your service address.
            </p>
          </div>
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

      {/* Sign out */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        To cancel your account, contact{' '}
        {company?.name ?? 'us'} {company?.email ? <>at {company.email}</> : null}.
      </p>
    </div>
  );
}
