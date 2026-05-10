export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MeasureView } from '@/components/measure/measure-view';
import { PageIntro } from '@/components/help/page-intro';
import { HowMeasureWorks } from '@/components/help/how-page-works';

export default async function StandaloneMeasurePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string; client_id?: string }>;
}) {
  const { address, client_id: clientIdParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  if (!profile?.company_id) {
    return (
      <div className="text-sm text-muted-foreground p-8">
        No company associated with your account. Contact your administrator.
      </div>
    );
  }

  const role = (profile as { role?: 'owner' | 'dispatcher' | 'crew' | 'customer' }).role ?? 'crew';
  const isCrew = role === 'crew';

  return (
    <>
      {/* Desktop: HowMeasureWorks link; hidden on mobile via md:block */}
      <div className="hidden md:flex items-center justify-end mb-2">
        <HowMeasureWorks />
      </div>
      {/* Desktop: PageIntro banners; hidden on mobile */}
      {isCrew ? (
        <div className="hidden md:block">
          <PageIntro
            id="measure-crew"
            title="Measure a property"
            description="Found a yard that's bigger than the original quote? Customer asking about adding services? Measure it here, send it to the office, and they'll follow up with a quote."
            steps={[
              'Search the address (or use the GPS button).',
              'Draw the yard, beds, and hardscape.',
              'Add a quick note about what the customer wants.',
              'Tap "Send to office for quote".',
            ]}
          />
        </div>
      ) : (
        <div className="hidden md:block">
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
        </div>
      )}
      <MeasureView
        companyId={profile.company_id}
        userId={user.id}
        initialAddress={address}
        initialClientId={clientIdParam ?? null}
        role={role}
        backHref={isCrew ? '/today' : '/dashboard'}
        standalone
      />
    </>
  );
}
