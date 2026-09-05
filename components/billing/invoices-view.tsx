'use client';

import { InvoiceTable } from '@/components/billing/invoice-table';
import { ListSearch, StatusPills, ListPager } from '@/components/shared/list-controls';
import { EmptyState } from '@/components/shared/empty-state';
import { Receipt } from 'lucide-react';
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
 * Interactive shell for the invoices list. Rows arrive from the server already
 * status-filtered (overdue derived from due_date), searched, and paged from
 * the URL (see app/dashboard/invoices/page.tsx); tab counts come from the
 * same definitions so they always agree with the rows.
 */
export function InvoicesView({
  invoices,
  counts,
  total,
  page,
  q,
}: {
  invoices: InvoiceWithClient[];
  counts: Record<string, number>;
  total: number;
  page: number;
  q: string;
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <ListSearch placeholder="Search by invoice number or client…" className="sm:flex-1 sm:max-w-sm" />
        <StatusPills options={STATUS_TABS} activeColor="var(--color-brand-green-raw)" counts={counts} />
      </div>
      {invoices.length === 0 && q ? (
        <EmptyState
          icon={Receipt}
          title={`No invoices match “${q}”`}
          description="Try a shorter search, or clear the status filter."
        />
      ) : (
        <InvoiceTable invoices={invoices} statusFilter="all" />
      )}
      <ListPager page={page} total={total} label="invoices" />
    </>
  );
}
