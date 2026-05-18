'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Client } from '@/types';
import { Home, Building2, Building, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const propertyTypeLabel: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  hoa: 'HOA',
};
const propertyTypeIcon: Record<string, React.ReactNode> = {
  residential: <Home className="h-3.5 w-3.5 inline mr-1" />,
  commercial:  <Building2 className="h-3.5 w-3.5 inline mr-1" />,
  hoa:         <Building className="h-3.5 w-3.5 inline mr-1" />,
};

const col = createColumnHelper<Client>();

interface ClientTableProps {
  data: Client[];
  globalFilter: string;
  onDeleted?: (clientId: string) => void;
}

export function ClientTable({ data, globalFilter, onDeleted }: ClientTableProps) {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('clients').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${deleteTarget.name} deleted.`);
    onDeleted?.(deleteTarget.id);
  }

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
      }),
      col.accessor('property_type', {
        header: 'Type',
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {propertyTypeIcon[info.getValue()]}
            {propertyTypeLabel[info.getValue()]}
          </span>
        ),
      }),
      col.accessor('service_address', {
        header: 'Address',
        cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
      }),
      col.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} type="client" />,
      }),
      col.display({
        id: 'edit',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/dashboard/clients/${row.original.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'gap-1.5 text-xs text-gray-700'
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        ),
      }),
      col.display({
        id: 'delete',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row.original);
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10'
            )}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      {/* Mobile: card layout */}
      <div className="md:hidden divide-y border rounded-xl overflow-hidden bg-card">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No clients found.</p>
        ) : (
          data.map((client) => (
            <div
              key={client.id}
              className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => router.push(`/dashboard/clients/${client.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{client.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {client.service_address}
                  </p>
                  {client.phone && (
                    <p className="text-xs text-muted-foreground mt-0.5">{client.phone}</p>
                  )}
                  {client.email && (
                    <p className="text-xs text-muted-foreground mt-0.5">{client.email}</p>
                  )}
                </div>
                <StatusBadge status={client.status} type="client" />
              </div>
              <div className="flex gap-2 mt-3 justify-end">
                <Link
                  href={`/dashboard/clients/${client.id}/edit`}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'gap-1.5 text-xs text-gray-700 h-8'
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(client);
                  }}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8'
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-semibold uppercase tracking-wide">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/dashboard/clients/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description="This permanently removes the client and any associated data. This cannot be undone — consider marking the client inactive instead."
        confirmLabel="Delete client"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
