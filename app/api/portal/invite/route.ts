import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';

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

  const origin = new URL(req.url).origin;
  const meta = { role: 'customer', company_id: profile.company_id, client_id: clientId };
  let invitedUserId: string | null = null;
  let emailed = false;

  if (emailConfigured()) {
    // Generate the invite link ourselves and deliver it through our provider
    // — Supabase's built-in mailer only reaches the project team's inboxes.
    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: meta, redirectTo: `${origin}/portal` },
    });
    if (linkError || !link?.user || !link.properties?.hashed_token) {
      return NextResponse.json({ error: linkError?.message ?? 'Could not create invite' }, { status: 400 });
    }
    invitedUserId = link.user.id;
    const { data: company } = await supabase.from('companies').select('name, email, phone').eq('id', profile.company_id).single();
    const companyName = company?.name ?? 'Your landscaper';
    const acceptUrl = `${origin}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=invite&next=/reset-password`;
    const { html, text } = brandedEmail({
      companyName,
      heading: `${companyName} set up your customer portal`,
      lines: [
        `Hi ${clientName?.split(' ')[0] ?? 'there'},`,
        `You can now see upcoming visits, invoices, and job photos for your property, request service, and message us — all in one place.`,
        'Tap the button to choose a password and open your portal.',
      ],
      cta: { label: 'Open my portal', url: acceptUrl },
      note: 'This invitation link works once and expires in 24 hours.',
    });
    const sent = await sendEmail({ to: email, subject: `Your customer portal from ${companyName}`, html, text, replyTo: company?.email ?? null });
    emailed = sent.ok;
  } else {
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: meta,
      redirectTo: `${origin}/portal`,
    });
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }
    invitedUserId = invited.user.id;
    emailed = true;
  }

  // Create portal_users record
  await supabase.from('portal_users').insert({
    id: invitedUserId,
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

  return NextResponse.json({ success: true, emailed });
}
