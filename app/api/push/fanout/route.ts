import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendPushToProfiles, pushConfigured } from '@/lib/push';

/**
 * Office → crew push. Client-side producers (route dispatch, announcements)
 * already wrote the in-app notification rows; they call this afterwards so
 * the phones buzz even with the app closed. Targets are resolved
 * server-side and always limited to the caller's company.
 *
 * Body: { title, body?, url?, profileIds?: string[], crewIds?: string[] }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!me?.company_id || !['owner', 'dispatcher'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!pushConfigured()) return NextResponse.json({ ok: true, sent: 0, skipped: 'no-provider' });
  const body = (await req.json().catch(() => null)) as { title?: string; body?: string; url?: string; profileIds?: string[]; crewIds?: string[] } | null;
  const title = (body?.title ?? '').trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const targets = new Set<string>();
  if (body?.crewIds?.length) {
    const { data: crews } = await admin.from('crews').select('id').eq('company_id', me.company_id).in('id', body.crewIds.slice(0, 50));
    const ids = (crews ?? []).map((c: { id: string }) => c.id);
    if (ids.length) {
      const { data: members } = await admin.from('crew_members').select('profile_id').in('crew_id', ids);
      for (const m of (members ?? []) as Array<{ profile_id: string }>) targets.add(m.profile_id);
    }
  }
  if (body?.profileIds?.length) {
    const { data: profiles } = await admin.from('profiles').select('id').eq('company_id', me.company_id).in('id', body.profileIds.slice(0, 200));
    for (const p of (profiles ?? []) as Array<{ id: string }>) targets.add(p.id);
  }
  targets.delete(user.id);
  const result = await sendPushToProfiles(admin, [...targets], {
    title,
    body: (body?.body ?? '').slice(0, 300) || null,
    url: body?.url && body.url.startsWith('/') ? body.url : '/today',
  });
  return NextResponse.json({ ok: true, ...result });
}
