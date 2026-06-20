export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import {
  AnalyticsView,
  type RevenueRow,
  type CrewPerfRow,
  type CrewId,
} from '@/components/analytics/analytics-view';
import type { ClientRevenueRow } from '@/components/analytics/client-revenue-table';
import type { Crew } from '@/types';

function monthLabel(iso: string) {
  // Pin to local noon so the month label doesn't slip a day (and month) in
  // timezones west of UTC. See app/dashboard/analytics/revenue/page.tsx.
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  const companyId = (profile as { company_id?: string } | null)?.company_id ?? null;

  // Server-side fetch via the cookie-based SSR client (RLS, no service-role
  // key). The materialized views aren't RLS-scoped, so the explicit
  // company_id filter is required — same as the original client query.
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [revRes, crewPerfRes, clientRes, crewRes, jobsRes] = companyId
    ? await Promise.all([
        supabase.from('mv_revenue_by_month').select('*').eq('company_id', companyId).order('month'),
        supabase.from('mv_crew_performance').select('*').eq('company_id', companyId).order('month'),
        supabase.from('mv_client_revenue').select('*').eq('company_id', companyId).order('lifetime_revenue', { ascending: false }),
        supabase.from('crews').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('jobs').select('status').eq('company_id', companyId).gte('scheduled_date', monthStart),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const revenueRows: RevenueRow[] = (revRes.data ?? []).map((r) => ({
    month: monthLabel(r.month),
    gross_revenue: Number(r.gross_revenue ?? 0),
    collected: Number(r.collected ?? 0),
    outstanding: Number(r.outstanding ?? 0),
    invoice_count: Number(r.invoice_count ?? 0),
  })).slice(-12);

  const crewPerf: CrewPerfRow[] = (crewPerfRes.data ?? []).map((r) => ({
    crew_id: r.crew_id,
    crew_name: r.crew_name,
    month: monthLabel(r.month),
    completed_jobs: Number(r.completed_jobs ?? 0),
    issue_jobs: Number(r.issue_jobs ?? 0),
    total_jobs: Number(r.total_jobs ?? 0),
  }));

  const clientRows: ClientRevenueRow[] = (clientRes.data ?? []).map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    property_type: r.property_type,
    total_invoices: Number(r.total_invoices ?? 0),
    lifetime_revenue: Number(r.lifetime_revenue ?? 0),
    lifetime_collected: Number(r.lifetime_collected ?? 0),
    avg_invoice_value: Number(r.avg_invoice_value ?? 0),
    last_invoice_date: r.last_invoice_date,
  }));

  const crewIds: CrewId[] = ((crewRes.data ?? []) as Crew[]).map((c) => ({
    id: c.id, name: c.name, color: c.color,
  }));

  // Job status counts for the current month.
  const jobStatus = { complete: 0, in_progress: 0, issue: 0, cancelled: 0 };
  for (const j of (jobsRes.data ?? []) as Array<{ status: string }>) {
    if (j.status === 'complete') jobStatus.complete++;
    else if (j.status === 'in_progress') jobStatus.in_progress++;
    else if (j.status === 'issue') jobStatus.issue++;
    else if (j.status === 'cancelled') jobStatus.cancelled++;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Revenue, performance, and profitability insights" />

      <PageIntro
        id="analytics"
        title="Business at a glance"
        description="Revenue, completion rates, and trends — month-to-date with last-month comparisons. Hover any sparkline for the day-by-day breakdown."
        steps={[
          'The top row shows MTD revenue, jobs completed, average ticket, and customer growth.',
          'Trend arrows compare to the prior month — green is up, red is down.',
          'For job-level cost vs. revenue, see Profitability.',
        ]}
      />

      <AnalyticsView
        revenueRows={revenueRows}
        jobStatus={jobStatus}
        crewPerf={crewPerf}
        clientRows={clientRows}
        crewIds={crewIds}
      />
    </div>
  );
}
