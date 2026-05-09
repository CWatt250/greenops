export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtUsd } from '@/lib/job-costing';
import { cn } from '@/lib/utils';
interface JobWithJoins {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  client: { id: string; name: string } | null;
  crew: { id: string; name: string; color: string } | null;
  revenue?: number | null;
  profit?: number | null;
  profit_margin_pct?: number | null;
  actual_total_cost?: number | null;
}

function marginTone(pct: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (pct >= 30) return 'green';
  if (pct >= 15) return 'yellow';
  if (pct > 0) return 'red';
  return 'gray';
}

const TONE_TEXT = {
  green: 'text-green-700',
  yellow: 'text-amber-700',
  red: 'text-red-700',
  gray: 'text-muted-foreground',
};

export default async function ProfitabilityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Pull only complete jobs that have a costing snapshot saved.
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      id, title, status, scheduled_date, revenue, profit, profit_margin_pct,
      actual_total_cost,
      client:clients(id, name),
      crew:crews(id, name, color),
      job_line_items(service:services(name, category))
    `)
    .eq('status', 'complete')
    .gt('revenue', 0)
    .order('scheduled_date', { ascending: false })
    .limit(500);

  const allJobs = (jobs ?? []) as unknown as JobWithJoins[];

  // ── Aggregations ──
  const byClient = new Map<string, { name: string; profit: number; jobs: number }>();
  for (const j of allJobs) {
    if (!j.client?.id) continue;
    const e = byClient.get(j.client.id) ?? { name: j.client.name, profit: 0, jobs: 0 };
    e.profit += Number(j.profit ?? 0);
    e.jobs += 1;
    byClient.set(j.client.id, e);
  }
  const topClients = Array.from(byClient.entries())
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 10);
  const lossClients = Array.from(byClient.entries())
    .filter(([, v]) => v.profit < 0)
    .sort((a, b) => a[1].profit - b[1].profit)
    .slice(0, 10);

  // Service breakdown — naive: sum profit per first-service-category per job.
  const byService = new Map<string, { profit: number; jobs: number }>();
  for (const j of allJobs) {
    const items = (j as unknown as { job_line_items?: Array<{ service?: { name: string } | null }> }).job_line_items ?? [];
    const svcName = items[0]?.service?.name ?? 'Other';
    const e = byService.get(svcName) ?? { profit: 0, jobs: 0 };
    e.profit += Number(j.profit ?? 0);
    e.jobs += 1;
    byService.set(svcName, e);
  }
  const topServices = Array.from(byService.entries())
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 8);

  // Crew breakdown
  const byCrew = new Map<string, { name: string; color: string; profit: number; jobs: number; margin: number; revenue: number }>();
  for (const j of allJobs) {
    if (!j.crew?.id) continue;
    const e = byCrew.get(j.crew.id) ?? {
      name: j.crew.name,
      color: j.crew.color,
      profit: 0, jobs: 0, margin: 0, revenue: 0,
    };
    e.profit += Number(j.profit ?? 0);
    e.revenue += Number(j.revenue ?? 0);
    e.jobs += 1;
    byCrew.set(j.crew.id, e);
  }
  const crewRows = Array.from(byCrew.entries()).map(([id, v]) => ({
    id,
    ...v,
    margin: v.revenue > 0 ? Math.round((v.profit / v.revenue) * 1000) / 10 : 0,
  })).sort((a, b) => b.margin - a.margin);

  // Monthly trend
  const byMonth = new Map<string, { profit: number; revenue: number; jobs: number }>();
  for (const j of allJobs) {
    const date = j.scheduled_date as string | null;
    if (!date) continue;
    const ym = date.slice(0, 7); // YYYY-MM
    const e = byMonth.get(ym) ?? { profit: 0, revenue: 0, jobs: 0 };
    e.profit += Number(j.profit ?? 0);
    e.revenue += Number(j.revenue ?? 0);
    e.jobs += 1;
    byMonth.set(ym, e);
  }
  const monthRows = Array.from(byMonth.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Profitability"
        eyebrow="Where the money is"
        description="Margin, profit, and which crews/clients/services pay the bills."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most profitable clients</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No completed jobs with revenue yet — save costing snapshots from job detail pages.
              </p>
            ) : (
              <ul className="divide-y -mx-6">
                {topClients.map(([id, v]) => (
                  <li key={id} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-medium truncate">{v.name}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {v.jobs} job{v.jobs === 1 ? '' : 's'}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--orange)' }}>
                        {fmtUsd(v.profit)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loss-making clients</CardTitle>
          </CardHeader>
          <CardContent>
            {lossClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No clients are losing money. Keep it that way.
              </p>
            ) : (
              <ul className="divide-y -mx-6">
                {lossClients.map(([id, v]) => (
                  <li key={id} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-medium truncate">{v.name}</span>
                    <span className="font-semibold tabular-nums text-red-700">
                      {fmtUsd(v.profit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most profitable services</CardTitle>
          </CardHeader>
          <CardContent>
            {topServices.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No data yet.</p>
            ) : (
              <ul className="divide-y -mx-6">
                {topServices.map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-medium truncate">{name}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {v.jobs} job{v.jobs === 1 ? '' : 's'}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {fmtUsd(v.profit)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crew profitability</CardTitle>
          </CardHeader>
          <CardContent>
            {crewRows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No data yet.</p>
            ) : (
              <ul className="divide-y -mx-6">
                {crewRows.map((r) => {
                  const tone = marginTone(r.margin);
                  return (
                    <li key={r.id} className="flex items-center justify-between px-6 py-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <span className="font-medium truncate">{r.name}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {r.jobs} job{r.jobs === 1 ? '' : 's'}
                        </span>
                        <span className={cn('font-bold tabular-nums', TONE_TEXT[tone])}>
                          {r.margin.toFixed(1)}%
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Average profit margin by month</CardTitle>
        </CardHeader>
        <CardContent>
          {monthRows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No data yet.</p>
          ) : (
            <ul className="divide-y -mx-6">
              {monthRows.map(([ym, v]) => {
                const margin = v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
                const tone = marginTone(margin);
                const label = new Date(`${ym}-01T12:00`).toLocaleDateString('en-US', {
                  month: 'long', year: 'numeric',
                });
                return (
                  <li key={ym} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {v.jobs} job{v.jobs === 1 ? '' : 's'} · {fmtUsd(v.revenue)} rev
                      </span>
                      <span className={cn('font-bold tabular-nums w-16 text-right', TONE_TEXT[tone])}>
                        {margin.toFixed(1)}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
