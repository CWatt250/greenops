export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MeasureView } from '@/components/measure/measure-view';

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
    <MeasureView
      companyId={profile.company_id}
      userId={user.id}
      initialAddress={address}
      backHref="/dashboard"
      standalone
    />
  );
}
