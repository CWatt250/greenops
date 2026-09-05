import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notifyStaff } from '@/lib/notify';

/**
 * Receives crash reports from the error boundaries (app/error.tsx and
 * friends). Stores the report in client_errors and pings the company's
 * owners once per distinct message per hour, so a broken page is noticed
 * by the people who can act on it instead of only by the person it hit.
 *
 * Always returns 204 — a failure to report must never surface as a second
 * error on top of the first.
 */
const MAX = { message: 500, stack: 4000, path: 300 };

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as
      | { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown }
      | null;
    const message = typeof body?.message === 'string' ? body.message.slice(0, MAX.message) : '';
    if (!message) return new NextResponse(null, { status: 204 });
    const stack = typeof body?.stack === 'string' ? body.stack.slice(0, MAX.stack) : null;
    const path = typeof body?.path === 'string' ? body.path.slice(0, MAX.path) : null;
    const digest = typeof body?.digest === 'string' ? body.digest.slice(0, 64) : null;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return new NextResponse(null, { status: 204 });
    }
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id ?? null;

    // Dedupe the owner ping: same message in the last hour → store, don't notify.
    let notify = !!companyId;
    if (companyId) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('client_errors')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('message', message)
        .gte('created_at', since);
      if ((count ?? 0) > 0) notify = false;
    }

    await admin.from('client_errors').insert({
      company_id: companyId,
      profile_id: user.id,
      path,
      message,
      digest,
      stack,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    });

    if (notify && companyId) {
      await notifyStaff(admin, {
        companyId,
        roles: ['owner'],
        title: `⚠️ App error on ${path ?? 'a page'}`,
        body: message.slice(0, 160),
        entityType: 'client_error',
      });
    }
  } catch {
    // Swallow — see note above.
  }
  return new NextResponse(null, { status: 204 });
}
