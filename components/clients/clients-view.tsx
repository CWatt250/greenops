'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientTable } from '@/components/clients/client-table';
import { EmptyState } from '@/components/shared/empty-state';
import { ListSearch, StatusPills, ListPager } from '@/components/shared/list-controls';
import { Users } from 'lucide-react';
import type { Client, ClientStatus } from '@/types';

const statusFilters: { label: string; value: ClientStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Prospect', value: 'prospect' },
];

/**
 * Interactive shell for the clients list. Rows arrive from the server already
 * searched, status-filtered, and paged from the URL (see
 * app/dashboard/clients/page.tsx), so the table is in the server-rendered
 * HTML. The page remounts this component (key) when the URL params change;
 * row deletes splice local state.
 */
export function ClientsView({
  initialClients,
  total,
  page,
  q,
}: {
  initialClients: Client[];
  total: number;
  page: number;
  q: string;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <ListSearch placeholder="Search by name, address, phone, or email…" className="flex-1" />
        <StatusPills options={statusFilters} activeColor="var(--color-brand-green-raw)" />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? `No clients match “${q}”` : 'No clients yet'}
          description={
            q
              ? 'Try a shorter search, or clear the status filter.'
              : 'Clients are the properties you service. Add one and you can schedule jobs, send invoices, and track profitability against them.'
          }
          action={{
            label: '+ Add your first client',
            onClick: () => router.push('/dashboard/clients/new'),
          }}
          secondaryAction={q ? undefined : {
            label: 'Learn more about clients →',
            onClick: () => window.open('https://tlclandscapemanagement.com/learn', '_blank'),
          }}
        />
      ) : (
        <ClientTable
          data={clients}
          globalFilter=""
          onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
        />
      )}
      <ListPager page={page} total={total} label="clients" />
    </>
  );
}
