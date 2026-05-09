import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/invite-templates';

interface Body {
  full_name: string;
  email: string;
  phone?: string | null;
  crew_id: string;
  hourly_rate?: number | null;
  hire_date?: string | null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  const me = profile as { company_id?: string; role?: string } | null;
  if (!me || (me.role !== 'owner' && me.role !== 'dispatcher')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!me.company_id) {
    return NextResponse.json({ error: 'No company' }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fullName = (body.full_name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const crewId = body.crew_id;
  if (!fullName || !email || !crewId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Confirm the crew belongs to the requester's company.
  const { data: crewRow } = await supabase
    .from('crews')
    .select('id')
    .eq('id', crewId)
    .eq('company_id', me.company_id)
    .single();
  if (!crewRow) {
    return NextResponse.json({ error: 'Crew not found in your company' }, { status: 404 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY not configured on the server.' },
      { status: 500 },
    );
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const password = generateTempPassword();

  // Create the auth user (email confirmed so the worker can sign in
  // immediately with the temp password we texted them).
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, invited_by: user.id },
  });
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create auth user' },
      { status: 400 },
    );
  }
  const newUserId = authData.user.id;

  // Insert profile row with crew role.
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: newUserId,
      company_id: me.company_id,
      full_name: fullName,
      phone: body.phone ?? null,
      role: 'crew',
      invited_at: new Date().toISOString(),
      temp_password: password,
    });
  if (profileError) {
    // Roll back the auth user so the dispatcher can retry without an
    // orphan row blocking the email.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Link the new profile to the chosen crew.
  const { error: memberError } = await adminClient
    .from('crew_members')
    .insert({
      crew_id: crewId,
      profile_id: newUserId,
      role: 'member',
      hourly_rate: body.hourly_rate ?? null,
    });
  if (memberError) {
    // Best-effort cleanup so a half-created worker doesn't linger.
    try { await adminClient.from('profiles').delete().eq('id', newUserId); } catch {}
    try { await adminClient.auth.admin.deleteUser(newUserId); } catch {}
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile_id: newUserId,
    email,
    password,
    full_name: fullName,
  });
}
