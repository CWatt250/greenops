export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MeasureView } from '@/components/measure/measure-view';
import { PageIntro } from '@/components/help/page-intro';
import { HowMeasureWorks } from '@/components/help/how-page-works';

export default async function StandaloneMeasurePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
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
    <>
      <div className="flex items-center justify-end mb-2">
        <HowMeasureWorks />
      </div>
      <PageIntro
        id="measure"
        title="Measure any property"
        description="Type an address, draw the lawn, and get instant square footage. Save measurements to clients or generate a proposal in two clicks."
        steps={[
          'Search an address up top — the map flies to the property.',
          'Click points on the map to outline the lawn, beds, or hardscape.',
          'Hit Save (to a client or as a quick lookup) or Generate Proposal.',
        ]}
      />
      <MeasureView
        companyId={profile.company_id}
        userId={user.id}
        initialAddress={address}
        backHref="/dashboard"
        standalone
      />
    </>
  );
}
