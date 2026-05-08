'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import type { Invoice, InvoiceStatus } from '@/types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const col = createColumnHelper<Invoice & { client?: { name: string } | null }>();

const columns = [
  col.accessor('invoice_number', {
    header: 'Invoice',
    cell: (info) => (
      <Link href={`/dashboard/invoices/${info.row.original.id}`} className="font-medium hover:underline text-sm">
        {info.getValue()}
      </Link>
    ),
  }),
  col.accessor((row) => row.client?.name ?? '—', {
    id: 'client_name',
    header: 'Client',
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  col.accessor('issued_date', {
    header: 'Issued',
    cell: (info) => <span className="text-sm tabular-nums">{info.getValue()}</span>,
  }),
  col.accessor('due_date', {
    header: 'Due',
    cell: (info) => {
      const val = info.getValue();
      if (!val) return <span className="text-muted-foreground text-sm">—</span>;
      const isOverdue = new Date(val) < new Date() && info.row.original.status !== 'paid';
      return (
        <span className={cn('text-sm tabular-nums', isOverdue && 'text-red-600 font-medium')}>
          {val}
        </span>
      );
    },
  }),
  col.accessor('total', {
    header: () => <span className="text-right block">Total</span>,
    cell: (info) => <span className="text-right block text-sm tabular-nums">{fmt(info.getValue())}</span>,
  }),
  col.accessor('balance_due', {
    header: () => <span className="text-right block">Balance</span>,
    cell: (info) => {
      const val = info.getValue();
      return (
        <span className={cn('text-right block text-sm tabular-nums font-medium', val > 0 && 'text-amber-700')}>
          {fmt(val)}
        </span>
      );
    },
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const s = info.getValue() as InvoiceStatus;
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_COLORS[s])}>
          {s}
        </span>
      );
    },
  }),
  col.display({
    id: 'actions',
    cell: (info) => (
      <Link
        href={`/dashboard/invoices/${info.row.original.id}`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}
      >
        View
      </Link>
    ),
  }),
];

interface Props {
  invoices: Array<Invoice & { client?: { name: string } | null }>;
  statusFilter?: InvoiceStatus | 'all';
}

export function InvoiceTable({ invoices, statusFilter = 'all' }: Props) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const filtered = statusFilter === 'all' ? invoices : invoices.filter((i) => i.status === statusFilter);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No invoices found.
      </p>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-muted/40 border-b">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'hover:bg-muted/30 transition-colors',
                row.original.status === 'overdue' && 'border-l-2 border-l-red-500'
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
