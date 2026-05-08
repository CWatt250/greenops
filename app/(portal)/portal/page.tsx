'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ClipboardList, MessageCircle, Camera, Receipt, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortalBanner } from '@/components/portal/portal-banner';
import type { Job, Invoice, ServiceRequest, Complaint } from '@/types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

type ActivityEvent = {
  id: string;
  label: string;
  sub: string;
  icon: string;
  time: string;
};

export default function PortalHomePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('there');
  const [nextJob, setNextJob] = useState<(Job & { crew?: { name: string; color: string } | null }) | null>(null);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [unpaidInvoiceId, setUnpaidInvoiceId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [banner, setBanner] = useState<{
    message: string;
    ctaLabel: string | null;
    ctaUrl: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pu } = await supabase.from('portal_users').select('full_name, client_id, company_id').eq('id', user.id).single();
      if (!pu) { setLoading(false); return; }

      // Pull the company's portal banner if one is enabled and not expired.
      const { data: company } = await supabase
        .from('companies')
        .select(
          'portal_banner_enabled, portal_banner_message, portal_banner_cta_label, portal_banner_cta_url, portal_banner_expires_at'
        )
        .eq('id', pu.company_id)
        .single();

      if (company?.portal_banner_enabled && company?.portal_banner_message) {
        const expiresAt = company.portal_banner_expires_at
          ? new Date(company.portal_banner_expires_at as string).getTime()
          : null;
        const stillLive = expiresAt === null || Date.now() < expiresAt;
        if (stillLive) {
          setBanner({
            message: String(company.portal_banner_message),
            ctaLabel: company.portal_banner_cta_label as string | null,
            ctaUrl: company.portal_banner_cta_url as string | null,
          });
        }
      }

      const fn = pu.full_name?.split(' ')[0] ?? 'there';
      setFirstName(fn);

      const today = new Date().toISOString().split('T')[0];

      const [jobRes, invRes, reqRes, complRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*, crew:crews(name, color)')
          .eq('client_id', pu.client_id)
          .gte('scheduled_date', today)
          .not('status', 'in', '("cancelled","complete")')
          .order('scheduled_date')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('invoices')
          .select('id, balance_due, status')
          .eq('client_id', pu.client_id)
          .not('status', 'in', '("paid","cancelled","draft")')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('service_requests')
          .select('id, title, status, created_at')
          .eq('client_id', pu.client_id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('complaints')
          .select('id, title, status, created_at')
          .eq('client_id', pu.client_id)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      setNextJob((jobRes.data as (Job & { crew?: { name: string; color: string } | null }) | null) ?? null);

      const invoices = invRes.data ?? [];
      const total = invoices.reduce((s, i) => s + Number(i.balance_due), 0);
      setUnpaidTotal(total);
      if (total > 0) setUnpaidInvoiceId(invoices[0]?.id ?? null);

      // Build activity timeline
      const events: ActivityEvent[] = [];
      for (const r of (reqRes.data ?? []) as ServiceRequest[]) {
        events.push({
          id: r.id,
          label: `Request: ${r.title}`,
          sub: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          icon: '📋',
          time: r.created_at,
        });
      }
      for (const c of (complRes.data ?? []) as Complaint[]) {
        events.push({
          id: c.id,
          label: `Issue: ${c.title}`,
          sub: c.status.charAt(0).toUpperCase() + c.status.slice(1),
          icon: '📸',
          time: c.created_at,
        });
      }
      events.sort((a, b) => b.time.localeCompare(a.time));
      setActivity(events.slice(0, 5));

      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {banner && (
        <PortalBanner
          message={banner.message}
          ctaLabel={banner.ctaLabel}
          ctaUrl={banner.ctaUrl}
        />
      )}

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">TLC Landscape Management</p>
      </div>

      {/* Outstanding invoice alert */}
      {unpaidTotal > 0 && unpaidInvoiceId && (
        <Link
          href={`/portal/invoices/${unpaidInvoiceId}`}
          className="flex items-center justify-between rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3"
        >
          <div>
            <p className="text-sm font-semibold text-red-700">Outstanding Balance</p>
            <p className="text-lg font-bold text-red-800">{fmt(unpaidTotal)}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-red-500 shrink-0" />
        </Link>
      )}

      {/* Next scheduled service */}
      {nextJob ? (
        <div
          className="rounded-2xl p-4 text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-brand-green-raw) 0%, #5a9c42 100%)' }}
        >
          <p className="text-xs font-semibold opacity-80 mb-1 uppercase tracking-wide">Next Service</p>
          <p className="text-lg font-bold">{nextJob.title}</p>
          <p className="text-sm opacity-90 mt-0.5">
            {nextJob.scheduled_date && new Date(`${nextJob.scheduled_date}T12:00`).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>
          {nextJob.crew && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="h-2 w-2 rounded-full bg-white/80" />
              <span className="text-xs opacity-80">{nextJob.crew.name}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-5 text-center">
          <p className="text-2xl mb-1">🌿</p>
          <p className="text-sm font-medium text-gray-600">No upcoming services</p>
          <Link href="/portal/requests/new" className="text-xs mt-1 block" style={{ color: 'var(--color-brand-green-raw)' }}>
            Request a service →
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/portal/requests/new', icon: ClipboardList, label: 'Request a Service', color: 'var(--color-brand-green-raw)' },
            { href: '/portal/messages', icon: MessageCircle, label: 'Message Us', color: '#3B82F6' },
            { href: '/portal/complaints/new', icon: Camera, label: 'Report an Issue', color: '#F59E0B' },
            { href: '/portal/invoices', icon: Receipt, label: 'View Invoices', color: '#8B5CF6' },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5 hover:shadow-md transition-shadow"
            >
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}18` }}
              >
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <span className="text-sm font-semibold text-gray-700">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Activity</p>
          <div className="space-y-2">
            {activity.map((evt) => (
              <div key={evt.id} className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
                <span className="text-xl shrink-0">{evt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{evt.label}</p>
                  <p className="text-xs text-gray-500">{evt.sub}</p>
                </div>
                <p className="text-[11px] text-gray-400 shrink-0">
                  {new Date(evt.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
