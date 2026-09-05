import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';

/**
 * Staff-only share-link management for a proposal.
 *  POST   — mint (or return the existing) public token; drafts flip to 'sent'.
 *           Body { send: true } also emails the link to the client.
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
  const url = `${origin}/p/${token}`;

  const body = (await req.json().catch(() => null)) as { send?: boolean } | null;
  let emailed = false;
  let reason: 'no-provider' | 'no-email' | 'send-failed' | null = null;
  if (body?.send) {
    const { data: full } = await supabase
      .from('estimates')
      .select('title, valid_until, client:clients(name, email)')
      .eq('id', id)
      .single();
    const client = (full?.client ?? null) as { name?: string; email?: string | null } | null;
    const { data: company } = await supabase
      .from('companies').select('name, email, phone').eq('id', estimate.company_id).single();
    const companyName = company?.name ?? 'Our team';
    if (!emailConfigured()) reason = 'no-provider';
    else if (!client?.email) reason = 'no-email';
    else {
      const { html, text } = brandedEmail({
        companyName,
        heading: `Your proposal from ${companyName}`,
        lines: [
          `Hi ${client.name?.split(' ')[0] ?? 'there'},`,
          `Your proposal "${full?.title ?? 'Proposal'}" is ready to review. Open it to see every line item, then accept with a quick signature — no account needed.`,
          ...(full?.valid_until ? [`This pricing is valid through ${full.valid_until}.`] : []),
        ],
        cta: { label: 'Review and sign', url },
        note: [company?.phone, company?.email].filter(Boolean).length
          ? `Questions? Reach us at ${[company?.phone, company?.email].filter(Boolean).join(' · ')}.`
          : null,
      });
      const sent = await sendEmail({ to: client.email, subject: `Your proposal from ${companyName}`, html, text, replyTo: company?.email ?? null });
      emailed = sent.ok;
      if (!sent.ok) reason = 'send-failed';
    }
  }
  return NextResponse.json({ ok: true, url, token, emailed, reason });
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
