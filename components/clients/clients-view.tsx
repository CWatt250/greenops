'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientTable } from '@/components/clients/client-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Users, Search } from 'lucide-react';
import type { Client, ClientStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusFilters: { label: string; value: ClientStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Prospect', value: 'prospect' },
];

/**
 * Interactive shell for the clients list. The rows are fetched on the server
 * (see app/dashboard/clients/page.tsx) and handed in as `initialClients`, so
 * the table is already in the server-rendered HTML — no client fetch waterfall.
 * Search + status filtering run in-memory over that initial set; row deletes
 * splice local state. Status is already a column on every row, so filtering it
 * client-side is equivalent to the old per-filter re-fetch but instant.
 */
export function ClientsView({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');

  const filtered = clients.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.service_address.toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, address, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                statusFilter === value
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              style={
                statusFilter === value
                  ? { backgroundColor: 'var(--color-brand-green-raw)' }
                  : {}
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Clients are the properties you service. Add one and you can schedule jobs, send invoices, and track profitability against them."
          action={{
            label: '+ Add your first client',
            onClick: () => router.push('/dashboard/clients/new'),
          }}
          secondaryAction={{
            label: 'Learn more about clients →',
            onClick: () => window.open('https://tlclandscapemanagement.com/learn', '_blank'),
          }}
        />
      ) : (
        <ClientTable
          data={filtered}
          globalFilter={search}
          onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
        />
      )}
    </>
  );
}
