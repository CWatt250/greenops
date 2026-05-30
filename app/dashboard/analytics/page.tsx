'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { StatCard } from '@/components/analytics/stat-card';
import { ClientRevenueTable } from '@/components/analytics/client-revenue-table';
import type { ClientRevenueRow } from '@/components/analytics/client-revenue-table';
import { ChevronRight } from 'lucide-react';
import type { Crew } from '@/types';

// Recharts is ~310 KB. Load each chart client-side after first paint so it
// stays out of this route's First Load JS. Placeholders match chart heights
// to avoid layout shift.
const chartFallback = (h: number) => () => (
  <div className="animate-pulse rounded-md bg-muted/50" style={{ height: h }} />
);
const RevenueChart = dynamic(
  () => import('@/components/analytics/revenue-chart').then((m) => m.RevenueChart),
  { ssr: false, loading: chartFallback(260) },
);
const JobStatusDonut = dynamic(
  () => import('@/components/analytics/job-status-donut').then((m) => m.JobStatusDonut),
  { ssr: false, loading: chartFallback(260) },
);
const CrewPerformanceChart = dynamic(
  () => import('@/components/analytics/crew-performance-chart').then((m) => m.CrewPerformanceChart),
  { ssr: false, loading: chartFallback(240) },
);

function fmtCurrency(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function AnalyticsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Revenue data
  const [revenueRows, setRevenueRows] = useState<Array<{
    month: string; gross_revenue: number; collected: number; outstanding: number; invoice_count: number;
  }>>([]);

  // Job status counts
  const [jobStatus, setJobStatus] = useState({ complete: 0, in_progress: 0, issue: 0, cancelled: 0 });

  // Crew performance
  const [crewPerf, setCrewPerf] = useState<Array<{
    crew_id: string; crew_name: string; month: string; completed_jobs: number; issue_jobs: number; total_jobs: number;
  }>>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

  // Client revenue
  const [clientRows, setClientRows] = useState<ClientRevenueRow[]>([]);

  const loadAll = useCallback(async (cId: string) => {
    const [revRes, crewRes, clientRes] = await Promise.all([
      supabase.from('mv_revenue_by_month').select('*').eq('company_id', cId).order('month'),
      supabase.from('mv_crew_performance').select('*').eq('company_id', cId).order('month'),
      supabase.from('mv_client_revenue').select('*').eq('company_id', cId).order('lifetime_revenue', { ascending: false }),
    ]);

    // Revenue
    const revData = (revRes.data ?? []).map((r) => ({
      month: monthLabel(r.month),
      gross_revenue: Number(r.gross_revenue ?? 0),
      collected: Number(r.collected ?? 0),
      outstanding: Number(r.outstanding ?? 0),
      invoice_count: Number(r.invoice_count ?? 0),
    }));
    setRevenueRows(revData.slice(-12));

    // Crew perf
    const perfData = (crewRes.data ?? []).map((r) => ({
      crew_id: r.crew_id,
      crew_name: r.crew_name,
      month: monthLabel(r.month),
      completed_jobs: Number(r.completed_jobs ?? 0),
      issue_jobs: Number(r.issue_jobs ?? 0),
      total_jobs: Number(r.total_jobs ?? 0),
    }));
    setCrewPerf(perfData);

    // Unique crews for filter chips
    const crewMap = new Map<string, string>();
    perfData.forEach((r) => crewMap.set(r.crew_id, r.crew_name));

    // Client revenue
    setClientRows((clientRes.data ?? []).map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      property_type: r.property_type,
      total_invoices: Number(r.total_invoices ?? 0),
      lifetime_revenue: Number(r.lifetime_revenue ?? 0),
      lifetime_collected: Number(r.lifetime_collected ?? 0),
      avg_invoice_value: Number(r.avg_invoice_value ?? 0),
      last_invoice_date: r.last_invoice_date,
    })));

    // Job status (direct query for accuracy)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: jData } = await supabase
      .from('jobs')
      .select('status')
      .eq('company_id', cId)
      .gte('scheduled_date', monthStart);

    const counts = { complete: 0, in_progress: 0, issue: 0, cancelled: 0 };
    for (const j of jData ?? []) {
      if (j.status === 'complete') counts.complete++;
      else if (j.status === 'in_progress') counts.in_progress++;
      else if (j.status === 'issue') counts.issue++;
      else if (j.status === 'cancelled') counts.cancelled++;
    }
    setJobStatus(counts);

    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        // Load crews for color mapping
        const { data: crewData } = await supabase.from('crews').select('*').eq('company_id', profile.company_id).eq('is_active', true);
        setCrews((crewData ?? []) as Crew[]);
        loadAll(profile.company_id);
      }
    });
  }, [loadAll]);

  // Stat card calculations
  const thisMonth = revenueRows.at(-1);
  const lastMonth = revenueRows.at(-2);
  const revMTD = thisMonth?.collected ?? 0;
  const revLastMTD = lastMonth?.collected ?? 0;
  const revTrend = revMTD >= revLastMTD ? 'up' : 'down';
  const revTrendPct = revLastMTD > 0 ? Math.round(((revMTD - revLastMTD) / revLastMTD) * 100) : 0;

  const jobsCompleted = jobStatus.complete;
  const outstanding = revenueRows.reduce((s, r) => s + r.outstanding, 0);

  const avgInv = thisMonth && thisMonth.invoice_count > 0
    ? thisMonth.gross_revenue / thisMonth.invoice_count : 0;
  const avgInvLast = lastMonth && lastMonth.invoice_count > 0
    ? lastMonth.gross_revenue / lastMonth.invoice_count : 0;
  const avgTrend = avgInv >= avgInvLast ? 'up' : 'down';

  const sparkRevenue = revenueRows.map((r) => r.collected);
  const crewIds = crews.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
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

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Revenue MTD"
          value={fmtCurrency(revMTD)}
          prefix="$"
          trend={revTrend}
          trendLabel={`${revTrendPct > 0 ? '+' : ''}${revTrendPct}% vs last month`}
          sparklineData={sparkRevenue}
        />
        <StatCard
          title="Jobs Completed"
          value={jobsCompleted}
          suffix=" this month"
          trend={jobsCompleted > 0 ? 'up' : 'neutral'}
          trendLabel={`${jobStatus.issue} issues flagged`}
        />
        <StatCard
          title="Avg Invoice Value"
          value={fmtCurrency(avgInv)}
          prefix="$"
          trend={avgTrend}
          trendLabel={`${avgTrend === 'up' ? '↑' : '↓'} vs last month`}
        />
        <StatCard
          title="Outstanding Balance"
          value={fmtCurrency(outstanding)}
          prefix="$"
          trend={outstanding > 0 ? 'down' : 'up'}
          trendLabel="across all open invoices"
        />
      </div>

      {/* Row 2: Revenue + Donut */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Revenue — Last 12 Months</h2>
            <Link href="/dashboard/analytics/revenue" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              Deep dive <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <RevenueChart data={revenueRows} />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Job Status — This Month</h2>
          </div>
          <JobStatusDonut data={jobStatus} />
        </div>
      </div>

      {/* Row 3: Crew Performance */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Crew Performance</h2>
          <Link href="/dashboard/analytics/crew" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            Deep dive <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <CrewPerformanceChart
          data={crewPerf}
          selectedCrewId={selectedCrewId}
          crewIds={crewIds}
          onCrewSelect={setSelectedCrewId}
        />
      </div>

      {/* Row 4: Client Revenue Table */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Top Clients by Revenue</h2>
          <Link href="/dashboard/analytics/clients" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <ClientRevenueTable data={clientRows} limit={10} />
      </div>
    </div>
  );
}
