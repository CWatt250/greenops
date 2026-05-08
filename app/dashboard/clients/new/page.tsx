export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClientForm } from '@/components/clients/client-form';
import { PageHeader } from '@/components/shared/page-header';

export default async function NewClientPage() {
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

  return (
    <div>
      <PageHeader title="New Client" description="Add a new client to your roster" />
      <ClientForm companyId={profile.company_id} />
    </div>
  );
}
