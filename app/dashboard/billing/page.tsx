'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { BillingScheduleCard } from '@/components/billing/billing-schedule-card';
import { cn } from '@/lib/utils';
import { Plus, FileText, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import type { Invoice, BillingSchedule } from '@/types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function BillingPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [schedules, setSchedules] = useState<BillingSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [invRes, schRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .not('status', 'in', '("cancelled")')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('billing_schedules')
        .select('*, client:clients(name,service_address)')
        .order('next_invoice_date'),
    ]);

    const now = new Date().toISOString().split('T')[0];
    const processed = (invRes.data ?? []).map((inv) => ({
      ...inv,
      status: (
        inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date && inv.due_date < now
      ) ? 'overdue' : inv.status,
    })) as Invoice[];

    setInvoices(processed);
    setSchedules((schRes.data ?? []) as BillingSchedule[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalOutstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((s, i) => s + i.balance_due, 0);
  const totalOverdue = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((s, i) => s + i.balance_due, 0);
  const draftCount = invoices.filter((i) => i.status === 'draft').length;

  const upcomingInvoices = invoices
    .filter((i) => i.status !== 'paid')
    .slice(0, 8);

  function handleScheduleUpdate(updated: BillingSchedule) {
    setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-purple-100 text-purple-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <PageHeader title="Billing" description="Revenue overview and recurring schedules">
        <Link
          href="/dashboard/invoices/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Link>
      </PageHeader>

      <PageIntro
        id="billing"
        title="Revenue at a glance"
        description="Outstanding balances, recurring contract schedules, and per-month revenue. Use this page to see the money side of the business."
        steps={[
          'The summary cards roll up Outstanding, Paid, and Recurring monthly value.',
          'Recurring contracts auto-generate invoices on the cadence you set on the proposal.',
          'For one-off invoices, use + New Invoice or invoice from a completed job.',
        ]}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Outstanding</p>
          </div>
          <p className="text-2xl font-bold">{fmt(totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-xs text-red-500 font-medium">Overdue</p>
          </div>
          <p className={cn('text-2xl font-bold', totalOverdue > 0 && 'text-red-600')}>
            {fmt(totalOverdue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Drafts</p>
          </div>
          <p className="text-2xl font-bold">{draftCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Active Schedules</p>
          </div>
          <p className="text-2xl font-bold">{schedules.filter((s) => s.is_active).length}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming invoices */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Open Invoices</h2>
            <Link href="/dashboard/invoices" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : upcomingInvoices.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 py-12 text-center">
              <p className="text-sm text-muted-foreground">No open invoices</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/dashboard/invoices/${inv.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-xl border bg-card px-4 py-3 hover:bg-muted/30 transition-colors',
                    inv.status === 'overdue' && 'border-l-2 border-l-red-500'
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{inv.invoice_number}</p>
                    {inv.due_date && (
                      <p className={cn('text-xs', inv.status === 'overdue' ? 'text-red-500' : 'text-muted-foreground')}>
                        Due {inv.due_date}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                      STATUS_COLORS[inv.status]
                    )}>
                      {inv.status}
                    </span>
                    <p className="text-sm font-semibold tabular-nums">{fmt(inv.balance_due)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Billing schedules */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Billing Schedules</h2>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : schedules.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 py-12 text-center">
              <p className="text-sm text-muted-foreground mb-2">No billing schedules</p>
              <p className="text-xs text-muted-foreground">
                Add recurring billing from a job's detail page.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <BillingScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  onUpdate={handleScheduleUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
