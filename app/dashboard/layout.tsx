import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell, type DashboardRole } from '@/components/layout/dashboard-shell';
import { DeactivatedScreen } from '@/components/shared/deactivated-screen';

/**
 * Server-side gate for every /dashboard route. proxy.ts already redirects
 * unauthenticated and mis-roled visitors, but a proxy is a single layer —
 * framework bypasses (GHSA-26hh-7cqf-hhc6 and friends) have shipped before.
 * Mirrors the crew and portal layouts, which have always checked here.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const [{ data: profile }, { data: portalUser }] = await Promise.all([
    supabase.from('profiles').select('role, is_active, company_id').eq('id', user.id).maybeSingle(),
    supabase.from('portal_users').select('id').eq('id', user.id).maybeSingle(),
  ]);

  // Customers never see office chrome, even for a moment.
  if (portalUser) redirect('/portal');

  const prof = profile as { role?: string; is_active?: boolean; company_id?: string } | null;
  const role = prof?.role;
  if (role !== 'owner' && role !== 'dispatcher' && role !== 'crew') redirect('/login');
  if (prof?.is_active === false) return <DeactivatedScreen />;

  // Company brand for the chrome (falls back to the platform default).
  const { data: company } = prof?.company_id
    ? await supabase.from('companies').select('name, logo_url').eq('id', prof.company_id).maybeSingle()
    : { data: null };

  return (
    <DashboardShell role={role as DashboardRole} brand={{ name: company?.name ?? null, logoUrl: company?.logo_url ?? null }}>
      {children}
    </DashboardShell>
  );
}
