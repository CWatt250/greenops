import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Browser CSP violation reports (Content-Security-Policy report-uri).
 * Stored in client_errors so a blocked resource in production shows up in
 * Settings → Message & error log instead of failing silently. Always 204.
 */
export async function POST(req: Request) {
  try {
    const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const r = (raw?.['csp-report'] ?? raw) as Record<string, unknown> | null;
    if (!r) return new NextResponse(null, { status: 204 });
    const blocked = String(r['blocked-uri'] ?? r.blockedURL ?? '').slice(0, 200);
    const directive = String(r['violated-directive'] ?? r.effectiveDirective ?? '').slice(0, 80);
    const doc = String(r['document-uri'] ?? r.documentURL ?? '').slice(0, 200);
    if (!blocked && !directive) return new NextResponse(null, { status: 204 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return new NextResponse(null, { status: 204 });
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let companyId: string | null = null;
    let profileId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        profileId = user.id;
        const { data } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
        companyId = data?.company_id ?? null;
      }
    } catch { /* anonymous report */ }
    const message = `CSP blocked ${blocked || '(inline)'} [${directive}]`;
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { count } = await admin.from('client_errors').select('id', { count: 'exact', head: true }).eq('message', message).gte('created_at', since);
    if ((count ?? 0) === 0) {
      await admin.from('client_errors').insert({ company_id: companyId, profile_id: profileId, path: doc ? new URL(doc).pathname : null, message, digest: 'csp', user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null });
    }
  } catch { /* never fail */ }
  return new NextResponse(null, { status: 204 });
}
