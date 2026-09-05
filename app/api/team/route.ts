import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';

/**
 * Team management (Settings → Team).
 *   GET                       list staff with email, role, status, crews
 *   POST { action:'invite', email, full_name, role }
 *   POST { action:'resend', id }            new sign-in link for a staff member
 *   POST { action:'role', id, role }        owner only
 *   POST { action:'deactivate' | 'reactivate', id }   owner only
 *
 * Deactivation bans the auth user (no new sessions) and flags the profile;
 * the dashboard/crew layouts refuse to render for a flagged profile so an
 * existing session dies on its next navigation.
 */
type Role = 'owner' | 'dispatcher' | 'crew';
const ROLES: Role[] = ['owner', 'dispatcher', 'crew'];

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('id, company_id, role, is_active').eq('id', user.id).single();
  if (!profile?.company_id || profile.is_active === false) return null;
  if (!['owner', 'dispatcher'].includes(profile.role)) return null;
  return { supabase, user, profile: profile as { id: string; company_id: string; role: Role } };
}

function admin(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const ctx = await me();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const a = admin();
  if (!a) return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  const [{ data: profiles }, { data: members }, users] = await Promise.all([
    a.from('profiles').select('id, full_name, phone, role, is_active, invited_at, last_signin_at, created_at').eq('company_id', ctx.profile.company_id).order('created_at'),
    a.from('crew_members').select('profile_id, crew:crews(name)'),
    a.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailById = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const crewsById = new Map<string, string[]>();
  for (const m of (members ?? []) as unknown as Array<{ profile_id: string; crew: { name: string } | null }>) {
    if (!m.crew) continue;
    crewsById.set(m.profile_id, [...(crewsById.get(m.profile_id) ?? []), m.crew.name]);
  }
  return NextResponse.json({
    me: ctx.profile.id,
    myRole: ctx.profile.role,
    members: (profiles ?? []).map((p) => ({ ...p, email: emailById.get(p.id) ?? null, crews: crewsById.get(p.id) ?? [] })),
  });
}

export async function POST(req: Request) {
  const ctx = await me();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const a = admin();
  if (!a) return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? '');
  const companyId = ctx.profile.company_id;
  const isOwner = ctx.profile.role === 'owner';
  const origin = new URL(req.url).origin;
  const { data: company } = await a.from('companies').select('name, email').eq('id', companyId).single();
  const companyName = company?.name ?? 'Your company';

  // ---- invite ------------------------------------------------------------
  if (action === 'invite') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const fullName = String(body?.full_name ?? '').trim().slice(0, 120);
    const role = String(body?.role ?? 'crew') as Role;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName || !ROLES.includes(role)) {
      return NextResponse.json({ error: 'Name, a valid email, and a role are required.' }, { status: 400 });
    }
    if (role !== 'crew' && !isOwner) return NextResponse.json({ error: 'Only an owner can invite office staff.' }, { status: 403 });

    const { data: existing } = await a.auth.admin.listUsers({ perPage: 1000 });
    if (existing?.users.some((u) => u.email?.toLowerCase() === email)) {
      return NextResponse.json({ error: 'That email already has an account.' }, { status: 409 });
    }

    let userId: string;
    let tempPassword: string | null = null;
    let emailed = false;
    if (emailConfigured()) {
      const { data: link, error } = await a.auth.admin.generateLink({
        type: 'invite', email, options: { data: { full_name: fullName, role, company_id: companyId }, redirectTo: `${origin}/` },
      });
      if (error || !link?.user || !link.properties?.hashed_token) {
        return NextResponse.json({ error: error?.message ?? 'Could not create the invite.' }, { status: 400 });
      }
      userId = link.user.id;
      const url = `${origin}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=invite&next=/reset-password`;
      const { html, text } = brandedEmail({
        companyName,
        heading: `${companyName} invited you to the team`,
        lines: [`Hi ${fullName.split(' ')[0]},`, `You've been added as ${role === 'crew' ? 'a crew member' : `a ${role}`}. Tap the button to choose a password and sign in.`],
        cta: { label: 'Set up my account', url },
        note: 'This link works once and expires in 24 hours.',
      });
      const sent = await sendEmail({ to: email, subject: `You're invited to ${companyName}`, html, text, replyTo: company?.email ?? null });
      emailed = sent.ok;
    } else {
      tempPassword = randomBytes(9).toString('base64url');
      const { data, error } = await a.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Could not create the account.' }, { status: 400 });
      userId = data.user.id;
    }
    const { error: profileError } = await a.from('profiles').upsert({
      id: userId, company_id: companyId, full_name: fullName, role, invited_at: new Date().toISOString(), temp_password: tempPassword, is_active: true,
    });
    if (profileError) {
      await a.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: userId, emailed, tempPassword });
  }

  // ---- everything below targets an existing member -----------------------
  const id = String(body?.id ?? '');
  const { data: target } = await a.from('profiles').select('id, role, is_active, full_name').eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'resend') {
    const { data: u } = await a.auth.admin.getUserById(id);
    const email = u?.user?.email;
    if (!email) return NextResponse.json({ error: 'No email on that account.' }, { status: 400 });
    if (!emailConfigured()) return NextResponse.json({ error: 'Email delivery is not configured.' }, { status: 501 });
    const { data: link, error } = await a.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${origin}/` } });
    if (error || !link?.properties?.hashed_token) return NextResponse.json({ error: error?.message ?? 'Could not create the link.' }, { status: 400 });
    const url = `${origin}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=/reset-password`;
    const { html, text } = brandedEmail({
      companyName,
      heading: 'Your sign-in link',
      lines: [`Hi ${(target.full_name ?? '').split(' ')[0] || 'there'},`, `Use the button to choose a password and sign in to ${companyName}.`],
      cta: { label: 'Sign in', url },
      note: 'This link works once and expires in one hour.',
    });
    const sent = await sendEmail({ to: email, subject: `Sign in to ${companyName}`, html, text, replyTo: company?.email ?? null });
    return NextResponse.json({ ok: sent.ok, emailed: sent.ok });
  }

  if (!isOwner) return NextResponse.json({ error: 'Only an owner can change roles or access.' }, { status: 403 });
  if (id === ctx.profile.id) return NextResponse.json({ error: "You can't change your own access here." }, { status: 400 });

  const { count: ownerCount } = await a.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('role', 'owner').eq('is_active', true);
  const lastOwner = target.role === 'owner' && (ownerCount ?? 0) <= 1;

  if (action === 'role') {
    const role = String(body?.role ?? '') as Role;
    if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    if (lastOwner && role !== 'owner') return NextResponse.json({ error: 'That is the only owner. Make someone else an owner first.' }, { status: 400 });
    const { error } = await a.from('profiles').update({ role }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === 'deactivate') {
    if (lastOwner) return NextResponse.json({ error: 'That is the only owner. Make someone else an owner first.' }, { status: 400 });
    const { error } = await a.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await a.from('profiles').update({ is_active: false, deactivated_at: new Date().toISOString() }).eq('id', id);
    await a.from('push_subscriptions').delete().eq('profile_id', id);
    return NextResponse.json({ ok: true });
  }
  if (action === 'reactivate') {
    const { error } = await a.auth.admin.updateUserById(id, { ban_duration: 'none' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await a.from('profiles').update({ is_active: true, deactivated_at: null }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
