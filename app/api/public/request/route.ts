import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyStaff } from '@/lib/notify';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';
import { logOutbound } from '@/lib/outbound-log';
import { normalizePhone } from '@/lib/sms';

/**
 * Public quote / service request (no login). Creates or reuses a lead
 * client under the company and files a service_request the office sees in
 * Portal Inbox → Requests, exactly like a portal submission. Compresses
 * lead-to-estimate time, which the 2026 reviews rank above every feature.
 *
 * Abuse controls: honeypot field, per-IP throttle (per instance), field
 * length caps, and a company must have public_requests_enabled.
 */
const REQUEST_TYPES = new Set(['new_service', 'quote_request', 'seasonal', 'other']);
const hits = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return NextResponse.json({ error: 'Too many requests — try again in an hour.' }, { status: 429 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (str(body.website, 100)) return NextResponse.json({ ok: true }); // honeypot: pretend success

  const slug = str(body.slug, 80);
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const phoneRaw = str(body.phone, 40);
  const address = str(body.address, 200);
  const city = str(body.city, 80);
  const zip = str(body.zip, 20);
  const type = REQUEST_TYPES.has(str(body.type, 30)) ? str(body.type, 30) : 'quote_request';
  const title = str(body.title, 140) || 'Quote request from website';
  const description = str(body.description, 2000);
  const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(str(body.preferred_date, 10)) ? str(body.preferred_date, 10) : null;

  if (!slug || !name || !address || (!email && !phoneRaw)) {
    return NextResponse.json({ error: 'Name, address, and a phone or email are required.' }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: company } = await admin
    .from('companies').select('id, name, email, phone, public_requests_enabled, state').eq('slug', slug).maybeSingle();
  if (!company || company.public_requests_enabled === false) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Reuse an existing client on email or phone; otherwise file a lead.
  const phoneDigits = normalizePhone(phoneRaw)?.replace(/\D/g, '').slice(-10) ?? null;
  let clientId: string | null = null;
  if (email) {
    const { data } = await admin.from('clients').select('id').eq('company_id', company.id).ilike('email', email).limit(1).maybeSingle();
    clientId = data?.id ?? null;
  }
  if (!clientId && phoneDigits) {
    const { data } = await admin.from('clients').select('id, phone').eq('company_id', company.id).not('phone', 'is', null).limit(2000);
    clientId = (data ?? []).find((c: { phone: string | null }) => (c.phone ?? '').replace(/\D/g, '').slice(-10) === phoneDigits)?.id ?? null;
  }
  if (!clientId) {
    const { data: created, error } = await admin.from('clients').insert({
      company_id: company.id,
      name,
      email: email || null,
      phone: phoneRaw || null,
      preferred_contact: phoneRaw ? 'phone' : 'email',
      property_type: 'residential',
      service_address: address,
      service_city: city || null,
      service_state: company.state ?? null,
      service_zip: zip || null,
      status: 'lead',
    }).select('id').single();
    if (error || !created) return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 });
    clientId = created.id;
  }

  const { data: request, error: reqErr } = await admin.from('service_requests').insert({
    company_id: company.id,
    client_id: clientId,
    portal_user_id: null,
    type,
    title,
    description: [description, `Submitted from the public request form. Contact: ${[name, phoneRaw, email].filter(Boolean).join(' · ')}`].filter(Boolean).join('\n\n'),
    preferred_date: preferredDate,
    status: 'pending',
  }).select('id').single();
  if (reqErr || !request) return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 });

  await notifyStaff(admin, {
    companyId: company.id,
    title: `🌱 New website request: ${title}`,
    body: `${name} — ${address}${phoneRaw ? ` · ${phoneRaw}` : ''}${email ? ` · ${email}` : ''}`,
    entityType: 'service_request',
    entityId: request.id,
  });

  if (email && emailConfigured()) {
    const { html, text } = brandedEmail({
      companyName: company.name,
      heading: `We got your request, ${name.split(' ')[0]}`,
      lines: [
        `Thanks for reaching out to ${company.name}. We'll review "${title}" and get back to you shortly${company.phone ? ` — or call us at ${company.phone}` : ''}.`,
        `Property: ${address}${city ? `, ${city}` : ''}`,
      ],
      note: 'Reply to this email if you want to add anything.',
    });
    const r = await sendEmail({ to: email, subject: `We got your request — ${company.name}`, html, text, replyTo: company.email ?? null });
    logOutbound(admin, { companyId: company.id, channel: 'email', recipient: email, template: 'request_received', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.id : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'service_request', entityId: request.id });
  }

  return NextResponse.json({ ok: true });
}
