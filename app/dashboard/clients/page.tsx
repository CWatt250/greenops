'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ClientTable } from '@/components/clients/client-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Users, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Client, ClientStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusFilters: { label: string; value: ClientStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Prospect', value: 'prospect' },
];

export default function ClientsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Only the columns the list + ClientTable actually render.
      let query = supabase
        .from('clients')
        .select('id, name, property_type, service_address, status, phone, email')
        .order('name');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data } = await query;
      setClients((data ?? []) as Client[]);
      setLoading(false);
    }
    load();
  }, [statusFilter]);

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.service_address.toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader title="Clients" description="Manage your client base">
        <Link
          href="/dashboard/clients/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Client
        </Link>
      </PageHeader>

      <PageIntro
        id="clients"
        title="Your client database"
        description="Every property you service. Click a client to see jobs, invoices, contact history, and notes in one place."
        steps={[
          '+ New Client uses Mapbox address autocomplete — just type the street.',
          'Search filters by name, address, or phone in real time.',
          'Click any row to open the client profile and timeline.',
        ]}
      />

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

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : filtered.length === 0 ? (
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

      {/* Mobile FAB — fixed above bottom nav */}
      <Link
        href="/dashboard/clients/new"
        className="md:hidden fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-50 h-14 w-14 rounded-full shadow-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        aria-label="New Client"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
