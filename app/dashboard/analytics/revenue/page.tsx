'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { PageHeader } from '@/components/shared/page-header';
import { RevenueChart } from '@/components/analytics/revenue-chart';
import { DateRangePicker, getDateRange } from '@/components/analytics/date-range-picker';
import { ChevronLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/components/analytics/revenue-chart';

interface MonthRow {
  month: string;
  monthRaw: string;
  invoice_count: number;
  gross_revenue: number;
  collected: number;
  outstanding: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function pct(a: number, b: number) {
  if (b === 0) return '—';
  return `${Math.round((a / b) * 100)}%`;
}

function monthLabel(iso: string) {
  // `iso` is a Postgres date_trunc('month') value (e.g. "2026-06-01..."). Parse
  // only the calendar date and pin to local noon so the month never slips a day
  // — and thus a whole month — when rendered west of UTC (Pacific showed "May"
  // for June otherwise).
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const SvcTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-lg" style={{ backgroundColor: '#1C2B1A', color: '#fff' }}>
      <p style={{ color: payload[0].payload.color }} className="font-semibold">{payload[0].name}</p>
      <p>{fmt(payload[0].value)}</p>
    </div>
  );
};

function RevenueAnalyticsContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [serviceBreakdown, setServiceBreakdown] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = getDateRange(searchParams);

  const loadData = useCallback(async (cId: string) => {
    setLoading(true);

    const { data } = await supabase
      .from('mv_revenue_by_month')
      .select('*')
      .eq('company_id', cId)
      .gte('month', from)
      .lte('month', to)
      .order('month');

    const monthRows: MonthRow[] = (data ?? []).map((r) => ({
      month: monthLabel(r.month),
      monthRaw: r.month,
      invoice_count: Number(r.invoice_count ?? 0),
      gross_revenue: Number(r.gross_revenue ?? 0),
      collected: Number(r.collected ?? 0),
      outstanding: Number(r.outstanding ?? 0),
    }));
    setRows(monthRows);

    // Service breakdown — query invoice line items for the period
    const { data: lineData } = await supabase
      .from('invoice_line_items')
      .select('total, service:services(name, category)')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`);

    const svcMap = new Map<string, number>();
    for (const li of lineData ?? []) {
      const svc = li.service as unknown as { name: string; category: string } | null;
      const name = svc?.name ?? 'Custom';
      svcMap.set(name, (svcMap.get(name) ?? 0) + Number(li.total ?? 0));
    }
    const colors = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.complete, CHART_COLORS.warning, CHART_COLORS.muted, CHART_COLORS.danger];
    setServiceBreakdown(
      Array.from(svcMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
    );

    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    getCompanyContext(supabase).then((ctx) => {
      if (!ctx) return;
      setCompanyId(ctx.companyId);
      loadData(ctx.companyId);
    });
  }, [loadData]);

  function exportCSV() {
    const header = ['Month', 'Invoices Sent', 'Gross Revenue', 'Collected', 'Outstanding', 'Collection Rate'];
    const csvRows = rows.map((r) => [
      r.month,
      r.invoice_count,
      r.gross_revenue.toFixed(2),
      r.collected.toFixed(2),
      r.outstanding.toFixed(2),
      pct(r.collected, r.gross_revenue),
    ]);
    const csv = [header, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Deep Dive" description="Monthly revenue breakdown and collection rates">
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>
      <Link href="/dashboard/analytics" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground -mt-4">
        <ChevronLeft className="h-3.5 w-3.5" /> Analytics
      </Link>

      {/* Date range picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Period:</span>
        <DateRangePicker />
      </div>

      {/* Revenue chart */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">Revenue vs Collected</h2>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <RevenueChart data={rows} />
        )}
      </div>

      {/* Two columns: table + service donut */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Breakdown table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                {['Month', 'Invoices', 'Gross', 'Collected', 'Outstanding', 'Rate'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No data for period</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.monthRaw} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.month}</td>
                    <td className="px-4 py-3 tabular-nums">{r.invoice_count}</td>
                    <td className="px-4 py-3 tabular-nums">{fmt(r.gross_revenue)}</td>
                    <td className="px-4 py-3 tabular-nums text-green-700 font-medium">{fmt(r.collected)}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-700">{fmt(r.outstanding)}</td>
                    <td className="px-4 py-3 tabular-nums">{pct(r.collected, r.gross_revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t bg-muted/20">
                <tr className="font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 tabular-nums">{rows.reduce((s, r) => s + r.invoice_count, 0)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(rows.reduce((s, r) => s + r.gross_revenue, 0))}</td>
                  <td className="px-4 py-3 tabular-nums text-green-700">{fmt(rows.reduce((s, r) => s + r.collected, 0))}</td>
                  <td className="px-4 py-3 tabular-nums text-amber-700">{fmt(rows.reduce((s, r) => s + r.outstanding, 0))}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {pct(rows.reduce((s, r) => s + r.collected, 0), rows.reduce((s, r) => s + r.gross_revenue, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Service breakdown donut */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Revenue by Service</h2>
          {serviceBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No service data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={serviceBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={96}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {serviceBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<SvcTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RevenueAnalyticsPage() {
  return (
    <Suspense>
      <RevenueAnalyticsContent />
    </Suspense>
  );
}
