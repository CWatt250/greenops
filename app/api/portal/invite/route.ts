import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, clientId, clientName } = await req.json() as { email: string; clientId: string; clientName: string };
  if (!email || !clientId) {
    return NextResponse.json({ error: 'Missing email or clientId' }, { status: 400 });
  }

  // Check client belongs to same company
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('company_id', profile.company_id)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Check portal_users record doesn't already exist for this client
  const { data: existing } = await supabase
    .from('portal_users')
    .select('id')
    .eq('client_id', clientId)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Portal user already exists for this client' }, { status: 409 });
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      role: 'customer',
      company_id: profile.company_id,
      client_id: clientId,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal`,
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  // Create portal_users record
  await supabase.from('portal_users').insert({
    id: invited.user.id,
    company_id: profile.company_id,
    client_id: clientId,
    full_name: clientName,
    notification_prefs: {
      email_job_reminder: true,
      email_invoice: true,
      email_request_update: true,
      sms_crew_enroute: false,
    },
  });

  return NextResponse.json({ success: true });
}
