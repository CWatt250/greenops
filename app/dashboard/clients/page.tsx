export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ClientsView } from '@/components/clients/clients-view';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Client, ClientStatus } from '@/types';
import { parseListParams, ilikePattern, type SearchParams } from '@/lib/list-params';

const CLIENT_STATUSES = ['active', 'inactive', 'prospect', 'lead'] as const satisfies readonly ClientStatus[];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = parseListParams(await searchParams, CLIENT_STATUSES);

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company (idx_clients_company_id). Search, status, and paging run
  // here so the list stays under PostgREST's 1,000-row cap.
  let query = supabase
    .from('clients')
    .select('id, name, property_type, service_address, status, phone, email', { count: 'exact' })
    .order('name');
  if (params.status !== 'all') query = query.eq('status', params.status);
  if (params.q) {
    const pattern = ilikePattern(params.q);
    query = query.or(`name.ilike.${pattern},service_address.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, count } = await query.range(params.from, params.to);
  const clients = (data ?? []) as Client[];
  const total = count ?? clients.length;

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

      <ClientsView
        key={`${params.page}|${params.status}|${params.q}`}
        initialClients={clients}
        total={total}
        page={params.page}
        q={params.q}
      />

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
