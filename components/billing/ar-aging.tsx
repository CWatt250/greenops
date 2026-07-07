'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { buildAging, buildAgingCsv, AGING_BUCKETS, type AgingInvoice } from '@/lib/ar-aging';
import { localDateStr } from '@/lib/dates';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Download, Loader2, ChevronDown, ChevronRight, Hourglass } from 'lucide-react';

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30d',
  '31-60': '31–60d',
  '61-90': '61–90d',
  '90+': '90+d',
};

/**
 * AR aging: every open balance bucketed by days past due, per client.
 * With payments recorded manually, this is the office's collections
 * worklist — worst offenders float to the top.
 */
export function ArAging() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<AgingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_id, due_date, balance_due, client:clients(name)')
        .gt('balance_due', 0)
        .not('status', 'in', '("draft","cancelled","paid")');
      if (cancelled) return;
      setInvoices(
        ((data ?? []) as unknown as Array<AgingInvoice & { client: { name: string } | null }>).map(
          (r) => ({ ...r, clientName: r.client?.name ?? 'No client' }),
        ),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = localDateStr();
  const aging = useMemo(() => buildAging(invoices, today), [invoices, today]);

  function exportCsv() {
    const csv = buildAgingCsv(aging, today);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ar-aging-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (aging.clients.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <Hourglass className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-semibold">Nothing outstanding</p>
        <p className="text-xs text-muted-foreground mt-1">Every issued invoice is paid up.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b">
        <div>
          <p className="text-sm font-semibold">AR Aging</p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(aging.grandTotal)} outstanding across {aging.clients.length} client{aging.clients.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      {/* Bucket totals strip */}
      <div className="grid grid-cols-5 border-b bg-muted/30 text-center">
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="px-1 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{BUCKET_LABELS[b]}</p>
            <p className={cn(
              'text-xs font-bold tabular-nums mt-0.5',
              b === '90+' && aging.totals[b] > 0 && 'text-red-600',
              (b === '31-60' || b === '61-90') && aging.totals[b] > 0 && 'text-amber-600',
            )}>
              {aging.totals[b] > 0 ? formatCurrency(aging.totals[b]) : '—'}
            </p>
          </div>
        ))}
      </div>

      <ul className="divide-y">
        {aging.clients.map((c) => {
          const key = c.clientName;
          const worst = [...AGING_BUCKETS].reverse().find((b) => c.buckets[b] > 0);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen(open === key ? null : key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/30"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium min-w-0">
                  {open === key
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{c.clientName}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {worst && worst !== 'current' && (
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      worst === '90+' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                    )}>
                      {BUCKET_LABELS[worst]}
                    </span>
                  )}
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(c.total)}</span>
                </span>
              </button>
              {open === key && (
                <ul className="border-t bg-muted/20 px-4 py-2 space-y-1">
                  {c.invoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                      <Link
                        href={`/dashboard/invoices/${i.id}`}
                        className="font-medium hover:underline truncate"
                      >
                        {i.invoice_number}
                      </Link>
                      <span className="text-muted-foreground shrink-0">
                        {i.daysPastDue > 0
                          ? `${i.daysPastDue}d overdue`
                          : i.due_date
                            ? `due ${new Date(`${i.due_date}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : 'no due date'}
                        <span className="font-semibold text-foreground tabular-nums ml-2">
                          {formatCurrency(Number(i.balance_due))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
