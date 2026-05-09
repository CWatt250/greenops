/**
 * Invite-message templating for the "Send App to Worker" flow.
 *
 * Variables substituted at render time:
 *   {{worker}}    — worker's first name
 *   {{sender}}    — current user's first name (or company name as fallback)
 *   {{company}}   — company display name
 *   {{appUrl}}    — deployed app URL (no trailing slash)
 *   {{email}}     — worker's email
 *   {{password}}  — auto-generated temp password
 */

export interface InviteVars {
  worker: string;
  sender: string;
  company: string;
  appUrl: string;
  email: string;
  password: string;
}

export const DEFAULT_INVITE_TEMPLATE = `Hey {{worker}}, it's {{sender}} from {{company}}. We're using a new app to manage daily jobs.

📲 INSTALL (takes 30 sec):
1. Open this link on your phone: {{appUrl}}
2. Log in with: {{email}}
3. Password: {{password}}
4. Tap "Add to Home Screen" so it shows up like a regular app

Then every morning just tap the TLC icon → see today's jobs → tap "Start" when you arrive at a stop, "Complete" when you finish.

Reply to this text if you have any issues. Welcome to the crew!`;

export const DEFAULT_EMAIL_SUBJECT = 'Welcome to the {{company}} crew';

export function renderInvite(template: string, vars: InviteVars): string {
  return template
    .replaceAll('{{worker}}', vars.worker)
    .replaceAll('{{sender}}', vars.sender)
    .replaceAll('{{company}}', vars.company)
    .replaceAll('{{appUrl}}', vars.appUrl)
    .replaceAll('{{email}}', vars.email)
    .replaceAll('{{password}}', vars.password);
}

/** Format a US-ish phone number for display: 5095550101 → 509-555-0101. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

/** Strip everything but digits + leading +. Used for sms: URLs. */
export function phoneForSmsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.slice(1).replace(/\D/g, '');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

/**
 * Build a cross-platform sms: URL. iOS Safari accepts the `&body=` form
 * (yes, ampersand for the first param) while Android tolerates `?body=`.
 * iOS treats both as equivalent on modern versions, so we use `&` which
 * works on both.
 */
export function buildSmsUrl(phone: string, body: string): string {
  const number = phoneForSmsUrl(phone);
  const encoded = encodeURIComponent(body);
  return `sms:${number}&body=${encoded}`;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/l confusion

/** Generate a short readable temp password: e.g. "TLC2026!K7P3". */
export function generateTempPassword(prefix = 'TLC'): string {
  const year = new Date().getFullYear();
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
  }
  return `${prefix}${year}!${suffix}`;
}
