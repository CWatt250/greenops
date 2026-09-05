import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell, type DashboardRole } from '@/components/layout/dashboard-shell';

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
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('portal_users').select('id').eq('id', user.id).maybeSingle(),
  ]);

  // Customers never see office chrome, even for a moment.
  if (portalUser) redirect('/portal');

  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'dispatcher' && role !== 'crew') redirect('/login');

  return <DashboardShell role={role as DashboardRole}>{children}</DashboardShell>;
}
