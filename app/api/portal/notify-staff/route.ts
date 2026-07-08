import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyStaff } from '@/lib/notify';

/**
 * Staff notification producer for PORTAL customers. Customers rightly can't
 * read the profiles table (they'd be enumerating staff), so the client-side
 * notifyStaff() path resolves zero recipients for them — this route does
 * the fan-out server-side instead. The caller only supplies the text; the
 * company always comes from their own portal_users row.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('company_id, client_id')
    .eq('id', user.id)
    .single();
  if (!portalUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { title?: string; body?: string; entityType?: string; entityId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const title = (body.title ?? '').trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { delivered } = await notifyStaff(admin, {
    companyId: portalUser.company_id,
    title,
    body: (body.body ?? '').trim().slice(0, 500) || null,
    entityType: body.entityType?.slice(0, 40),
    entityId: body.entityId,
  });
  return NextResponse.json({ ok: true, delivered });
}
