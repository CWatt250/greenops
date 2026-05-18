'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { InvoiceTable } from '@/components/billing/invoice-table';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@/types';

type InvoiceWithClient = Invoice & { client: { name: string } | null };

const STATUS_TABS: Array<{ label: string; value: InvoiceStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Partial', value: 'partial' },
  { label: 'Paid', value: 'paid' },
];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InvoiceStatus | 'all'>('all');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invoices')
      .select('*, client:clients(name)')
      .order('created_at', { ascending: false });

    // Mark overdue invoices
    const now = new Date().toISOString().split('T')[0];
    const processed = (data ?? []).map((inv) => ({
      ...inv,
      status: (
        inv.status !== 'paid' &&
        inv.status !== 'cancelled' &&
        inv.due_date &&
        inv.due_date < now
      ) ? 'overdue' : inv.status,
    })) as InvoiceWithClient[];

    setInvoices(processed);
    setLoading(false);
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // Summary strip
  const totalOutstanding = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + i.balance_due, 0);
  const totalOverdue = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((s, i) => s + i.balance_due, 0);
  const totalPaidThisMonth = invoices
    .filter((i) => {
      const thisMonth = new Date().toISOString().slice(0, 7);
      return i.status === 'paid' && i.paid_at?.startsWith(thisMonth);
    })
    .reduce((s, i) => s + i.total, 0);

  return (
    <div>
      <PageHeader title="Invoices" description="Billing and payment tracking">
        <Link
          href="/dashboard/invoices/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Link>
      </PageHeader>

      <PageIntro
        id="invoices"
        title="Bill and collect"
        description="Track outstanding balances, generate PDF invoices for any completed job, and mark payment when it lands."
        steps={[
          'Outstanding / Paid / Overdue tiles up top show health at a glance.',
          'Click + New Invoice to build one from scratch, or use the "Invoice this job" action on any complete job.',
          'Mark Paid records the payment and stops dunning emails.',
        ]}
      />

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-xl font-bold mt-1">{fmt(totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-red-500 font-medium">Overdue</p>
          <p className={cn('text-xl font-bold mt-1', totalOverdue > 0 && 'text-red-600')}>
            {fmt(totalOverdue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Paid This Month</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(totalPaidThisMonth)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const count = tab.value === 'all'
            ? invoices.length
            : invoices.filter((i) => i.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.value
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
              style={activeTab === tab.value ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.value ? 'bg-white/20' : 'bg-background'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-16">Loading invoices…</p>
      ) : (
        <InvoiceTable invoices={invoices} statusFilter={activeTab} />
      )}
    </div>
  );
}
