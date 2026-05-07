'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { RouteEfficiencyChart } from '@/components/analytics/route-efficiency-chart';
import { ChevronLeft } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { CHART_COLORS } from '@/components/analytics/revenue-chart';
import { cn } from '@/lib/utils';
import type { Crew, Job } from '@/types';

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

const TrendTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-lg" style={{ backgroundColor: '#1C2B1A', color: '#fff' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}%</p>
      ))}
    </div>
  );
};

export default function CrewAnalyticsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [crewPerf, setCrewPerf] = useState<Array<{
    crew_id: string; crew_name: string; month: string;
    total_jobs: number; completed_jobs: number; issue_jobs: number; cancelled_jobs: number;
    avg_job_minutes: number | null;
  }>>([]);
  const [routeEff, setRouteEff] = useState<Array<{
    month: string; avg_drive_minutes: number; avg_job_minutes: number; avg_stops: number;
  }>>([]);
  const [recentJobs, setRecentJobs] = useState<Array<Job & { client?: { name: string } | null }>>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async (cId: string) => {
    const [perfRes, routeRes] = await Promise.all([
      supabase.from('mv_crew_performance').select('*').eq('company_id', cId).order('month'),
      supabase.from('mv_route_efficiency').select('*').eq('company_id', cId).order('month'),
    ]);

    setCrewPerf((perfRes.data ?? []).map((r) => ({
      crew_id: r.crew_id,
      crew_name: r.crew_name,
      month: monthLabel(r.month),
      total_jobs: Number(r.total_jobs ?? 0),
      completed_jobs: Number(r.completed_jobs ?? 0),
      issue_jobs: Number(r.issue_jobs ?? 0),
      cancelled_jobs: Number(r.cancelled_jobs ?? 0),
      avg_job_minutes: r.avg_job_minutes != null ? Math.round(Number(r.avg_job_minutes)) : null,
    })));

    const effByMonth = new Map<string, { month: string; avg_drive_minutes: number; avg_job_minutes: number; avg_stops: number }>();
    for (const r of routeRes.data ?? []) {
      const key = monthLabel(r.month);
      const existing = effByMonth.get(key) ?? { month: key, avg_drive_minutes: 0, avg_job_minutes: 0, avg_stops: 0 };
      effByMonth.set(key, {
        month: key,
        avg_drive_minutes: (existing.avg_drive_minutes + Number(r.avg_drive_minutes ?? 0)) / 2,
        avg_job_minutes: (existing.avg_job_minutes + Number(r.avg_job_minutes ?? 0)) / 2,
        avg_stops: (existing.avg_stops + Number(r.avg_stops ?? 0)) / 2,
      });
    }
    setRouteEff(Array.from(effByMonth.values()));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: p } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      if (!p?.company_id) return;
      setCompanyId(p.company_id);
      const { data: crewData } = await supabase.from('crews').select('*').eq('company_id', p.company_id).eq('is_active', true);
      const crewList = (crewData ?? []) as Crew[];
      setCrews(crewList);
      if (crewList.length > 0) setSelectedCrewId(crewList[0].id);
      loadAll(p.company_id);
    });
  }, [loadAll]);

  // Load recent jobs for selected crew
  useEffect(() => {
    if (!selectedCrewId) return;
    supabase
      .from('jobs')
      .select('*, client:clients(name)')
      .eq('crew_id', selectedCrewId)
      .order('scheduled_date', { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentJobs((data ?? []) as Array<Job & { client?: { name: string } | null }>));
  }, [selectedCrewId]);

  const selectedPerf = crewPerf.filter((r) => r.crew_id === selectedCrewId);
  const selectedCrew = crews.find((c) => c.id === selectedCrewId);

  // Completion rate trend
  const completionTrend = selectedPerf.map((r) => ({
    month: r.month,
    rate: r.total_jobs > 0 ? Math.round((r.completed_jobs / r.total_jobs) * 100) : 0,
  }));

  // Aggregate stats
  const totalJobs = selectedPerf.reduce((s, r) => s + r.total_jobs, 0);
  const totalCompleted = selectedPerf.reduce((s, r) => s + r.completed_jobs, 0);
  const totalIssues = selectedPerf.reduce((s, r) => s + r.issue_jobs, 0);
  const completionRate = totalJobs > 0 ? Math.round((totalCompleted / totalJobs) * 100) : 0;
  const avgDuration = selectedPerf.reduce((s, r) => s + (r.avg_job_minutes ?? 0), 0) / (selectedPerf.length || 1);

  const STATUS_COLORS: Record<string, string> = {
    complete: 'text-green-600',
    in_progress: 'text-blue-600',
    scheduled: 'text-muted-foreground',
    issue: 'text-red-500',
    cancelled: 'text-muted-foreground',
    unscheduled: 'text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Crew Performance" description="Completion rates, efficiency, and route data per crew" />
      <Link href="/analytics" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground -mt-4">
        <ChevronLeft className="h-3.5 w-3.5" /> Analytics
      </Link>

      {/* Crew selector tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {crews.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCrewId(c.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors border',
              selectedCrewId === c.id ? 'text-white border-transparent' : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
            style={selectedCrewId === c.id ? { backgroundColor: c.color } : {}}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
      ) : (
        <>
          {/* Per-crew stat strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Jobs', value: totalJobs },
              { label: 'Completion Rate', value: `${completionRate}%` },
              { label: 'Avg Job Duration', value: avgDuration > 0 ? `${Math.round(avgDuration)}m` : '—' },
              { label: 'Issues Flagged', value: totalIssues },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4" style={{ borderTop: `4px solid ${selectedCrew?.color ?? '#3D6B2C'}` }}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Completion rate trend */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Completion Rate Trend</h2>
            {completionTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={completionTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Completion %"
                    stroke={selectedCrew?.color ?? CHART_COLORS.primary}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: selectedCrew?.color ?? CHART_COLORS.primary }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Route efficiency */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Route Efficiency</h2>
            <RouteEfficiencyChart data={routeEff} />
          </div>

          {/* Recent jobs list */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">Recent Jobs — {selectedCrew?.name}</h2>
            </div>
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No jobs found</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Job', 'Client', 'Date', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(j.client as { name: string } | null)?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{j.scheduled_date ?? '—'}</td>
                      <td className={cn('px-4 py-3 capitalize text-xs font-medium', STATUS_COLORS[j.status])}>
                        {j.status.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
