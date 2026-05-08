export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ClientForm } from '@/components/clients/client-form';
import { PageHeader } from '@/components/shared/page-header';
import type { Client } from '@/types';

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) {
    return (
      <div className="text-sm text-muted-foreground p-8">
        No company associated with your account. Contact your administrator.
      </div>
    );
  }

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('company_id', profile.company_id)
    .single();

  if (!client) notFound();

  return (
    <div>
      <PageHeader
        title="Edit Client"
        description={(client as Client).name}
      />
      <ClientForm
        companyId={profile.company_id}
        initialData={client as Client}
      />
    </div>
  );
}
