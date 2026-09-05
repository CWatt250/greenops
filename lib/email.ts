/**
 * Transactional email (roadmap F0.1). One sender for the whole app, backed
 * by Resend's REST API — no SDK, no Supabase SMTP dependency. Server-only:
 * the API key must never reach the browser.
 *
 * Configuration (Vercel env):
 *   RESEND_API_KEY  — send-only key restricted to the sending domain
 *   EMAIL_FROM      — e.g. "TLC Management Platform <noreply@inbound.watt-systems.com>"
 *
 * Without a key every call resolves { ok: false, skipped: 'no-provider' }
 * so callers can fall back (mailto, copy-link) instead of failing.
 */
export const DEFAULT_FROM = 'TLC Management Platform <noreply@inbound.watt-systems.com>';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: 'no-provider' }
  | { ok: false; error: string };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: 'no-provider' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: json?.id ?? null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export interface BrandedEmailInput {
  companyName: string;
  heading: string;
  /** Paragraphs, plain text. */
  lines: string[];
  cta?: { label: string; url: string } | null;
  /** Small print under the button, plain text. */
  note?: string | null;
}

/** Table-based HTML that renders the same in Gmail, Outlook, and Apple Mail. */
export function brandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const green = '#3D6B2C';
  const paragraphs = input.lines
    .map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1C2B1A">${esc(l)}</p>`)
    .join('');
  const cta = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0"><tr><td style="background:${green};border-radius:8px">
        <a href="${esc(input.cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${esc(input.cta.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#5C665A">Or paste this link into your browser:<br><a href="${esc(input.cta.url)}" style="color:${green};word-break:break-all">${esc(input.cta.url)}</a></p>`
    : '';
  const note = input.note ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#5C665A">${esc(input.note)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F5F5F0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F5F0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="background:${green};padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700">${esc(input.companyName)}</td></tr>
  <tr><td style="padding:26px 24px 8px">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1C2B1A">${esc(input.heading)}</h1>
    ${paragraphs}${cta}${note}
  </td></tr>
  <tr><td style="padding:16px 24px 22px;font-size:11px;line-height:1.5;color:#8A948A;border-top:1px solid #EDEFE8">
    Sent by ${esc(input.companyName)} through the TLC Management Platform. Questions about this message? Reply to this email.
  </td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    input.heading,
    '',
    ...input.lines,
    ...(input.cta ? ['', `${input.cta.label}: ${input.cta.url}`] : []),
    ...(input.note ? ['', input.note] : []),
    '',
    `— ${input.companyName}`,
  ].join('\n');
  return { html, text };
}
