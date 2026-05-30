'use client';

import { useState } from 'react';
import { InvoiceTable } from '@/components/billing/invoice-table';
import { cn } from '@/lib/utils';
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

/**
 * Interactive shell for the invoices list. Rows are fetched + overdue-marked on
 * the server (see app/dashboard/invoices/page.tsx) and handed in as `invoices`,
 * so the table is already in the server-rendered HTML — no client fetch
 * waterfall. Only the status-tab selection is stateful here; filtering is
 * delegated to InvoiceTable.
 */
export function InvoicesView({ invoices }: { invoices: InvoiceWithClient[] }) {
  const [activeTab, setActiveTab] = useState<InvoiceStatus | 'all'>('all');

  return (
    <>
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

      <InvoiceTable invoices={invoices} statusFilter={activeTab} />
    </>
  );
}
