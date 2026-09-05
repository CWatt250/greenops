import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyCustomer } from '@/lib/notify';

/** Office updates a reported issue; customer notice fans out to email server-side. */
const STATUSES = new Set(['open', 'reviewing', 'resolved', 'closed']);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!me || !['owner', 'dispatcher'].includes(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { status?: string; notes?: string } | null;
  const status = String(body?.status ?? '');
  if (!STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes) patch.resolution_notes = notes;
  if (status === 'resolved' || status === 'closed') patch.resolved_at = new Date().toISOString();
  const { data, error } = await supabase.from('complaints').update(patch).eq('id', id).select().single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await notifyCustomer(admin, {
      portalUserId: data.portal_user_id ?? undefined,
      clientId: data.portal_user_id ? undefined : data.client_id,
      title: `Issue update: ${data.title}`,
      body: `Your reported issue is now ${status}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
      type: 'complaint_update',
      entityType: 'complaint',
      entityId: data.id,
    });
  }
  return NextResponse.json({ ok: true, complaint: data });
}
