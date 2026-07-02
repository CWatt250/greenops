import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

/**
 * Staff-only share-link management for a proposal.
 *  POST   — mint (or return the existing) public token; drafts flip to 'sent'.
 *  DELETE — revoke the link (token nulled; the public page 404s immediately).
 */

async function loadAuthorized(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!profile || !['owner', 'dispatcher'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, company_id, status, public_token')
    .eq('id', id)
    .single();
  if (!estimate || estimate.company_id !== profile.company_id) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { supabase, estimate };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadAuthorized(id);
  if ('error' in loaded) return loaded.error;
  const { supabase, estimate } = loaded;

  const token = estimate.public_token ?? randomBytes(16).toString('hex');
  const patch: Record<string, unknown> = {
    public_token: token,
    updated_at: new Date().toISOString(),
  };
  if (!estimate.public_token) patch.public_token_created_at = new Date().toISOString();
  if (estimate.status === 'draft') patch.status = 'sent';

  const { error } = await supabase.from('estimates').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${origin}/p/${token}`, token });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadAuthorized(id);
  if ('error' in loaded) return loaded.error;
  const { supabase } = loaded;

  const { error } = await supabase
    .from('estimates')
    .update({ public_token: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
