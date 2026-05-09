import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Leaf } from 'lucide-react';
import { PortalNav } from '@/components/portal/portal-nav';
import { PortalNotificationBell } from '@/components/portal/portal-notification-bell';
import type { Company, PortalUser } from '@/types';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Non-customers belong in the admin dashboard
  if (profile?.role && profile.role !== 'customer') redirect('/');

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('*')
    .eq('id', user.id)
    .single();

  // Touch last_seen_at
  if (portalUser) {
    await supabase
      .from('portal_users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  const pu = portalUser as PortalUser | null;
  const firstName = pu?.full_name?.split(' ')[0] ?? 'there';

  const { data: companyRow } = pu?.company_id
    ? await supabase.from('companies').select('*').eq('id', pu.company_id).single()
    : { data: null };
  const company = companyRow as Company | null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-brand-cream-raw)' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 shrink-0"
        style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}
      >
        <div className="flex items-center gap-2.5">
          {company?.logo_url ? (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={company.logo_url}
                alt={`${company.name} logo`}
                className="h-9 w-9 object-contain"
              />
            </div>
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              <Leaf className="h-4 w-4 text-white" />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-white leading-none">
              {company?.name ?? 'Customer Portal'}
            </p>
            {company?.tagline ? (
              <p className="text-[11px] leading-tight" style={{ color: 'var(--orange)' }}>
                {company.tagline}
              </p>
            ) : (
              <p className="text-[11px] text-white/50 leading-tight">Customer Portal</p>
            )}
          </div>
        </div>
        {pu && <PortalNotificationBell portalUserId={pu.id} />}
      </header>

      {/* Main content with bottom nav padding */}
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">
        {children}
      </main>

      {/* Bottom navigation */}
      <PortalNav />
    </div>
  );
}
