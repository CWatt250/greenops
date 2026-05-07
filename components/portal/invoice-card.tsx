'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import type { Invoice } from '@/types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Unpaid', color: 'bg-amber-100 text-amber-700' },
  viewed: { label: 'Viewed', color: 'bg-purple-100 text-purple-700' },
  partial: { label: 'Partial', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-400' },
};

interface Props {
  invoice: Invoice;
  isOverdue?: boolean;
}

export function InvoiceCard({ invoice, isOverdue }: Props) {
  const cfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.sent;
  const isUnpaid = invoice.status !== 'paid' && invoice.status !== 'cancelled';

  return (
    <Link
      href={`/portal/invoices/${invoice.id}`}
      className={cn(
        'flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow',
        isOverdue && 'border-l-4 border-l-red-500'
      )}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-sm">{invoice.invoice_number}</p>
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.color)}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-gray-500">{invoice.issued_date}</p>
        {isUnpaid && invoice.balance_due > 0 && (
          <p className="text-xs font-semibold text-red-600 mt-1">
            Balance: {fmt(invoice.balance_due)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="font-bold text-sm">{fmt(invoice.total)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </Link>
  );
}
