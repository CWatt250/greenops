import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Save (POST) or remove (DELETE) this device's push subscription. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: user.id,
      company_id: profile?.company_id ?? null,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  await supabase.from('push_subscriptions').delete().eq('profile_id', user.id).eq('endpoint', body.endpoint);
  return NextResponse.json({ ok: true });
}
