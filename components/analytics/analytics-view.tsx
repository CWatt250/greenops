'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { StatCard } from '@/components/analytics/stat-card';
import { ClientRevenueTable, type ClientRevenueRow } from '@/components/analytics/client-revenue-table';
import { ChevronRight } from 'lucide-react';

// Recharts is ~310 KB. Load each chart client-side after first paint so it
// stays out of this route's First Load JS. Placeholders match chart heights
// to avoid layout shift. ssr:false is allowed here because this is a Client
// Component; the data itself is fetched on the server (see the page).
function chartFallback(h: number) {
  function ChartFallback() {
    return <div className="animate-pulse rounded-md bg-muted/50" style={{ height: h }} />;
  }
  return ChartFallback;
}
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

export type RevenueRow = {
  month: string; gross_revenue: number; collected: number; outstanding: number; invoice_count: number;
};
export type JobStatusCounts = { complete: number; in_progress: number; issue: number; cancelled: number };
export type CrewPerfRow = {
  crew_id: string; crew_name: string; month: string; completed_jobs: number; issue_jobs: number; total_jobs: number;
};
export type CrewId = { id: string; name: string; color: string };

function fmtCurrency(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

/**
 * Interactive body of the analytics dashboard. All data is fetched + shaped on
 * the server (see app/dashboard/analytics/page.tsx) and handed in as props, so
 * the stat cards + client-revenue table are in the server-rendered HTML on
 * first paint — no full-page "Loading analytics…" spinner and no client-side
 * data waterfall. The Recharts charts still lazy-load (ssr:false) after paint;
 * the crew-performance crew selection is the only stateful bit here.
 */
export function AnalyticsView({
  revenueRows,
  jobStatus,
  crewPerf,
  clientRows,
  crewIds,
}: {
  revenueRows: RevenueRow[];
  jobStatus: JobStatusCounts;
  crewPerf: CrewPerfRow[];
  clientRows: ClientRevenueRow[];
  crewIds: CrewId[];
}) {
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

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

  return (
    <>
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
    </>
  );
}
