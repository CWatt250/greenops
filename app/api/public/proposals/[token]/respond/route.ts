import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyStaff } from '@/lib/notify';

/**
 * Public (no-login) accept/decline for a shared proposal. The token IS the
 * authorization — 128 random bits, revocable, and the link dies with
 * valid_until. Runs on the service role; every mutation is guarded by the
 * token match + current status.
 */

interface AcceptBody {
  action: 'accept';
  name: string;
  signature: string; // PNG data URL from the signature pad
}
interface DeclineBody {
  action: 'decline';
  reason?: string;
}

const MAX_SIGNATURE_BYTES = 200_000; // trimmed pad PNGs are ~10-30KB

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let body: AcceptBody | DeclineBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, company_id, status, valid_until, title, client:clients(name)')
    .eq('public_token', token)
    .single();
  if (!estimate) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  if (!['sent', 'draft'].includes(estimate.status)) {
    return NextResponse.json({ error: 'This proposal has already been responded to.' }, { status: 409 });
  }
  if (estimate.valid_until && estimate.valid_until < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: 'This proposal has expired — please contact us for an updated quote.' }, { status: 410 });
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const now = new Date().toISOString();
  const clientName = (estimate.client as { name?: string } | null)?.name;

  if (body.action === 'accept') {
    const name = (body.name ?? '').trim();
    const signature = body.signature ?? '';
    if (!name) return NextResponse.json({ error: 'Please type your name.' }, { status: 400 });
    if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_BYTES) {
      return NextResponse.json({ error: 'Please sign before accepting.' }, { status: 400 });
    }
    // Status guard in the WHERE clause makes double-submits a no-op.
    const { data: updated, error } = await admin
      .from('estimates')
      .update({
        status: 'accepted',
        accepted_at: now,
        acceptance_name: name,
        acceptance_signature: signature,
        acceptance_ip: ip,
        updated_at: now,
      })
      .eq('id', estimate.id)
      .in('status', ['sent', 'draft'])
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated?.length) {
      return NextResponse.json({ error: 'This proposal has already been responded to.' }, { status: 409 });
    }
    await notifyStaff(admin, {
      companyId: estimate.company_id,
      title: `✅ Proposal accepted: ${estimate.title}`,
      body: [clientName, `Signed by ${name}`].filter(Boolean).join(' — ') || null,
      entityType: 'estimate',
      entityId: estimate.id,
    });
    return NextResponse.json({ ok: true, status: 'accepted' });
  }

  if (body.action === 'decline') {
    const reason = (body.reason ?? '').trim().slice(0, 1000) || null;
    const { data: updated, error } = await admin
      .from('estimates')
      .update({
        status: 'declined',
        declined_at: now,
        decline_reason: reason,
        acceptance_ip: ip,
        updated_at: now,
      })
      .eq('id', estimate.id)
      .in('status', ['sent', 'draft'])
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated?.length) {
      return NextResponse.json({ error: 'This proposal has already been responded to.' }, { status: 409 });
    }
    await notifyStaff(admin, {
      companyId: estimate.company_id,
      title: `Proposal declined: ${estimate.title}`,
      body: [clientName, reason].filter(Boolean).join(' — ') || null,
      entityType: 'estimate',
      entityId: estimate.id,
    });
    return NextResponse.json({ ok: true, status: 'declined' });
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
