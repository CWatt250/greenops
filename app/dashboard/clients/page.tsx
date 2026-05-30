export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ClientsView } from '@/components/clients/clients-view';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Client } from '@/types';

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company, and the company-scoped read uses idx_clients_company_id.
  // Only the columns the list + ClientTable render.
  const { data } = await supabase
    .from('clients')
    .select('id, name, property_type, service_address, status, phone, email')
    .order('name');
  const clients = (data ?? []) as Client[];

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

      <ClientsView initialClients={clients} />

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
