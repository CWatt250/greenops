'use client';

import { useRouter } from 'next/navigation';
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
import { StatusBadge } from '@/components/shared/status-badge';
import type { Client } from '@/types';
import { Home, Building2, Building, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buttonVariants } from '@/components/ui/button';
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

const columns = [
  col.accessor('name', {
    header: 'Name',
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
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
    cell: (info) => (
      <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
        {info.getValue()}
      </span>
    ),
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} type="client" />,
  }),
  col.display({
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8')}
          onClick={(e) => e.stopPropagation()}
          aria-label="Actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<a href={`/clients/${row.original.id}`} />}
          >
            View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }),
];

interface ClientTableProps {
  data: Client[];
  globalFilter: string;
}

export function ClientTable({ data, globalFilter }: ClientTableProps) {
  const router = useRouter();

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="rounded-lg border overflow-hidden">
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
                onClick={() => router.push(`/clients/${row.original.id}`)}
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
  );
}
