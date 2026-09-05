import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { normalizePhone, STOP_WORDS, START_WORDS } from '@/lib/sms';

/**
 * Twilio inbound-message webhook. Point the number's "A message comes in"
 * URL here. Keeps our consent records aligned with carrier-level STOP/START
 * so a customer who opted out by text is never messaged again by the app.
 *
 * Signature check: X-Twilio-Signature = base64(HMAC-SHA1(authToken,
 * url + sorted(param key+value))) per Twilio's spec.
 */
function validSignature(url: string, params: URLSearchParams, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const keys = [...params.keys()].sort();
  const data = url + keys.map((k) => k + (params.get(k) ?? '')).join('');
  const expected = createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  // Twilio signs the public URL it was configured with; behind Vercel that is
  // the https origin + path (no query string).
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  const publicUrl = `${proto}://${host}${u.pathname}`;
  if (!validSignature(publicUrl, params, req.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const from = normalizePhone(params.get('From'));
  const body = params.get('Body') ?? '';
  if (from && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Phones are stored as typed; match on the digits.
    const digits = from.replace(/\D/g, '').slice(-10);
    const { data: clients } = await admin.from('clients').select('id, phone').not('phone', 'is', null);
    const ids = (clients ?? [])
      .filter((c: { phone: string | null }) => (c.phone ?? '').replace(/\D/g, '').slice(-10) === digits)
      .map((c: { id: string }) => c.id);
    if (ids.length) {
      if (STOP_WORDS.test(body)) {
        await admin.from('clients').update({ sms_opt_out_at: new Date().toISOString() }).in('id', ids);
      } else if (START_WORDS.test(body)) {
        await admin.from('clients').update({ sms_opt_out_at: null, sms_consent: true }).in('id', ids);
      }
    }
  }
  return new NextResponse(TWIML, { headers: { 'Content-Type': 'text/xml' } });
}
