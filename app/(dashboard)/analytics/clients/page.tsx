'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { ClientRevenueTable } from '@/components/analytics/client-revenue-table';
import type { ClientRevenueRow } from '@/components/analytics/client-revenue-table';
import { ChevronLeft, AlertTriangle } from 'lucide-react';

export default function ClientsAnalyticsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<ClientRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', user.user.id).single();
    if (!p?.company_id) return;

    const { data } = await supabase
      .from('mv_client_revenue')
      .select('*')
      .eq('company_id', p.company_id)
      .order('lifetime_revenue', { ascending: false });

    setRows((data ?? []).map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      property_type: r.property_type,
      total_invoices: Number(r.total_invoices ?? 0),
      lifetime_revenue: Number(r.lifetime_revenue ?? 0),
      lifetime_collected: Number(r.lifetime_collected ?? 0),
      avg_invoice_value: Number(r.avg_invoice_value ?? 0),
      last_invoice_date: r.last_invoice_date,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const lowValueCount = rows.filter((r) => {
    if (!r.last_invoice_date) return true;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return r.total_invoices < 2 || new Date(r.last_invoice_date) < sixMonthsAgo;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Client Profitability" description="Revenue and engagement across all clients" />
      <Link href="/analytics" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground -mt-4">
        <ChevronLeft className="h-3.5 w-3.5" /> Analytics
      </Link>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Clients</p>
          <p className="text-2xl font-bold mt-1">{rows.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Lifetime Revenue</p>
          <p className="text-2xl font-bold mt-1">
            ${rows.reduce((s, r) => s + r.lifetime_revenue, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs text-amber-600 font-medium">Low Engagement</p>
          </div>
          <p className="text-2xl font-bold mt-1">{lowValueCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Upsell opportunities</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
      ) : (
        <ClientRevenueTable data={rows} showFilters />
      )}

      {lowValueCount > 0 && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {lowValueCount} client{lowValueCount !== 1 ? 's' : ''} flagged for low engagement
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              These clients have fewer than 2 invoices or haven't been serviced in 6+ months.
              Consider reaching out to re-engage or upsell additional services.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
