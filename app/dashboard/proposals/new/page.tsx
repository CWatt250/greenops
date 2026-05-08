export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProposalWizard } from '@/components/proposals/proposal-wizard';
import { PageHeader } from '@/components/shared/page-header';
import type { Service } from '@/types';

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; measurement_id?: string }>;
}) {
  const { client_id, measurement_id } = await searchParams;
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

  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('company_id', profile.company_id)
    .eq('is_active', true)
    .order('name');

  // Skip Step 1 (client picker) when both client + measurement are set —
  // the dispatcher came from the measurement tool and wants Step 2.
  const startStep: 1 | 2 = client_id && measurement_id ? 2 : 1;

  return (
    <div>
      <PageHeader
        title="New Proposal"
        eyebrow="Estimate to win"
        description="Build a polished, professional proposal in three steps."
      />
      <ProposalWizard
        companyId={profile.company_id}
        userId={user.id}
        services={(services ?? []) as Service[]}
        initialClientId={client_id}
        initialMeasurementId={measurement_id}
        initialStep={startStep}
      />
    </div>
  );
}
