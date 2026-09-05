/**
 * SMS (roadmap F2.1) through Twilio's REST API — no SDK. Server-only.
 *
 * Configuration (Vercel env):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_FROM (E.164 number)  or  TWILIO_MESSAGING_SERVICE_SID
 *
 * Without configuration every send resolves { skipped: 'no-provider' } and
 * the caller falls back (in-app notice, email). Consent is enforced by
 * smsAllowed(): a customer is texted only if the office recorded consent
 * on the client or the customer turned it on in the portal, and never
 * after a STOP.
 *
 * Launch prerequisite for US traffic: register an A2P 10DLC campaign in
 * the Twilio console; carriers filter unregistered business texts.
 */
export type SendSmsResult =
  | { ok: true; sid: string | null }
  | { ok: false; skipped: 'no-provider' }
  | { ok: false; error: string };

export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

/** US-centric E.164 normalization; returns null when it can't be a phone. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export interface SmsConsentInput {
  sms_consent?: boolean | null;
  sms_opt_out_at?: string | null;
  /** portal_users.notification_prefs rows for the client, if any */
  portalPrefs?: Array<Record<string, unknown> | null>;
}

export function smsAllowed(c: SmsConsentInput): boolean {
  if (c.sms_opt_out_at) return false;
  if (c.sms_consent) return true;
  return (c.portalPrefs ?? []).some((p) => p && p['sms_crew_enroute'] === true);
}

export const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
export const START_WORDS = /^\s*(start|unstop|yes)\s*$/i;

export async function sendSms(input: { to: string; body: string }): Promise<SendSmsResult> {
  if (!smsConfigured()) return { ok: false, skipped: 'no-provider' };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const to = normalizePhone(input.to);
  if (!to) return { ok: false, error: 'Invalid phone number' };
  const params = new URLSearchParams({ To: to, Body: input.body.slice(0, 1600) });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else params.set('From', process.env.TWILIO_FROM!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${json?.message ?? ''}`.trim() };
    return { ok: true, sid: json?.sid ?? null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
