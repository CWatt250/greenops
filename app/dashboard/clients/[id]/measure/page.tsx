export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { MeasureView } from '@/components/measure/measure-view';
import type { Client, PropertyMeasurement } from '@/types';

export default async function ClientMeasurePage({
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
  const c = client as Client;

  // Pull the most recent saved measurement (if any) so it pre-populates.
  const { data: existing } = await supabase
    .from('property_measurements')
    .select('*')
    .eq('client_id', id)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build the address line for geocoding.
  const fullAddress = [c.service_address, c.service_city, c.service_state, c.service_zip]
    .filter(Boolean)
    .join(', ');

  return (
    <MeasureView
      companyId={profile.company_id}
      userId={user.id}
      clientId={id}
      clientName={c.name}
      initialAddress={fullAddress || undefined}
      initial={existing as PropertyMeasurement | null}
      backHref={`/dashboard/clients/${id}`}
    />
  );
}
