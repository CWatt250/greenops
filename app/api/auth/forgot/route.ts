import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';

/**
 * Password recovery that does not depend on Supabase's built-in mailer
 * (which only delivers to the project's own team addresses). We generate
 * the recovery link server-side and send it through our own provider; with
 * no provider configured we fall back to Supabase's mailer.
 *
 * Always answers 200 with the same body so the endpoint cannot be used to
 * discover which emails have accounts.
 */
const OK = NextResponse.json({ ok: true });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return OK;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return OK;
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  try {
    if (emailConfigured() && serviceKey) {
      const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
      if (error || !data?.properties?.hashed_token) return OK; // unknown email → silent
      const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=/reset-password`;
      const { html, text } = brandedEmail({
        companyName: 'TLC Management Platform',
        heading: 'Reset your password',
        lines: [
          'Someone asked to reset the password for this account. If that was you, choose a new password with the button below.',
          'If you did not ask for this, you can ignore this email — nothing changes until the link is used.',
        ],
        cta: { label: 'Choose a new password', url: link },
        note: 'This link works once and expires in one hour.',
      });
      await sendEmail({ to: email, subject: 'Reset your password', html, text });
      return OK;
    }
    // Fallback: Supabase's own mailer.
    const anon = createAdminClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await anon.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    /* always OK */
  }
  return OK;
}
