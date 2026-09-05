import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing route for Supabase Auth email links (password recovery, invites,
 * magic links). Exchanges the one-time code for a session cookie, then sends
 * the user on to `next` (relative paths only). Both link shapes are handled:
 * PKCE `?code=` (what @supabase/ssr issues) and `?token_hash=&type=` (the
 * default email templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const supabase = await createClient();
  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = !!error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = !!error;
  }

  if (failed) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'link');
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(next, origin));
}
