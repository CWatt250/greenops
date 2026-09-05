'use client';

import Link from 'next/link';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export interface ClientRevenueRow {
  client_id: string;
  client_name: string;
  property_type: string;
  total_invoices: number;
  lifetime_revenue: number;
  lifetime_collected: number;
  avg_invoice_value: number;
  last_invoice_date: string | null;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function isLowValue(row: ClientRevenueRow) {
  if (!row.last_invoice_date) return true;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return row.total_invoices < 2 || new Date(row.last_invoice_date) < sixMonthsAgo;
}

const col = createColumnHelper<ClientRevenueRow>();

const columns = [
  col.accessor('client_name', {
    header: 'Client',
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/clients/${info.row.original.client_id}`}
          className="text-sm font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
        {isLowValue(info.row.original) && (
          <span title="Low engagement — upsell opportunity">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>
    ),
  }),
  col.accessor('property_type', {
    header: 'Type',
    cell: (info) => (
      <span className="text-xs capitalize text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  col.accessor('total_invoices', {
    header: ({ column }) => <SortableHeader column={column} label="Invoices" />,
    cell: (info) => <span className="text-sm tabular-nums">{info.getValue()}</span>,
  }),
  col.accessor('lifetime_revenue', {
    header: ({ column }) => <SortableHeader column={column} label="Lifetime Revenue" />,
    cell: (info) => <span className="text-sm tabular-nums font-medium">{fmt(info.getValue())}</span>,
  }),
  col.accessor('avg_invoice_value', {
    header: ({ column }) => <SortableHeader column={column} label="Avg Invoice" />,
    cell: (info) => <span className="text-sm tabular-nums">{fmt(info.getValue())}</span>,
  }),
  col.accessor('last_invoice_date', {
    header: 'Last Service',
    cell: (info) => {
      const val = info.getValue();
      if (!val) return <span className="text-sm text-muted-foreground">—</span>;
      return <span className="text-sm tabular-nums">{val.split('T')[0]}</span>;
    },
  }),
  col.display({
    id: 'actions',
    cell: (info) => (
      <Link
        href={`/dashboard/clients/${info.row.original.client_id}`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}
      >
        View
      </Link>
    ),
  }),
];

function SortableHeader({ column, label }: { column: any; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

interface Props {
  data: ClientRevenueRow[];
  limit?: number;
  showFilters?: boolean;
}

export function ClientRevenueTable({ data, limit, showFilters = false }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lifetime_revenue', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  const filtered = propertyFilter === 'all'
    ? data
    : data.filter((r) => r.property_type === propertyFilter);
  const sliced = limit ? filtered.slice(0, limit) : filtered;

  const table = useReactTable({
    data: sliced,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const propertyTypes = Array.from(new Set(data.map((r) => r.property_type)));

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {['all', ...propertyTypes].map((pt) => (
            <button
              key={pt}
              onClick={() => setPropertyFilter(pt)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                propertyFilter === pt ? 'text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
              style={propertyFilter === pt ? { backgroundColor: '#3D6B2C' } : {}}
            >
              {pt === 'all' ? 'All Types' : pt}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No client data yet
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-muted/30 transition-colors',
                    isLowValue(row.original) && 'bg-amber-50/40'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
