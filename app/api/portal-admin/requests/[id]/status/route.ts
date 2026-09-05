import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyCustomer } from '@/lib/notify';

/**
 * Office updates a customer's service request. Runs server-side so the
 * customer notice can fan out to email (notifyCustomer's email leg is
 * server-only and honors the portal "Request Updates" preference).
 */
const STATUSES = new Set(['pending', 'reviewing', 'scheduled', 'completed', 'declined']);

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
  if (notes) patch.admin_notes = notes;
  if (status === 'scheduled' || status === 'completed' || status === 'declined') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = user.id;
  }
  // RLS scopes the update to the caller's company.
  const { data, error } = await supabase.from('service_requests').update(patch).eq('id', id).select().single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await notifyCustomer(admin, {
      portalUserId: data.portal_user_id ?? undefined,
      clientId: data.portal_user_id ? undefined : data.client_id,
      title: `Request update: ${data.title}`,
      body: `Status changed to ${status}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
      type: 'request_update',
      entityType: 'service_request',
      entityId: data.id,
    });
  }
  return NextResponse.json({ ok: true, request: data });
}
