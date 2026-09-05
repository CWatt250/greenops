import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Role-aware proxy (Next.js 16's renamed middleware). Belt-and-suspenders
 * route guarding on top of the layout-level redirects:
 *
 *   - portal_users (customers) → /portal/*
 *   - role='crew'              → /today
 *   - role in (owner, dispatcher) → /dashboard/*
 *
 * If a layout misconfiguration exposed admin data to a customer, this would
 * still redirect them away.
 */

const PUBLIC_PATHS = ['/login', '/forgot-password'];
// Pages anyone can view, logged in or not (tokenized proposal links, the
// auth code-exchange callback that email links land on).
const OPEN_PATHS = ['/p', '/auth', '/legal', '/request'];
const PUBLIC_API_PREFIXES = ['/api/optimize-route', '/api/invite-worker', '/api/public', '/api/webhooks'];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isOpenPage = OPEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
  const isApi = path.startsWith('/api/');

  // Unauthenticated visitors hitting a protected page → /login.
  if (!user && !isLoginPage && !isOpenPage && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Carry the full path + query so deep links (e.g. ?quick=1) survive sign-in.
    url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Logged-in user hitting /login → bounce to their home.
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Public API routes: skip role checks (they auth-scope server-side).
  if (isPublicApi) return supabaseResponse;

  // Open pages render for everyone — skip role redirects.
  if (isOpenPage) return supabaseResponse;

  // Role-aware redirects. Run only for authenticated, non-API requests.
  if (user && !isApi) {
    const [{ data: profile }, { data: portalUser }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('portal_users').select('id').eq('id', user.id).maybeSingle(),
    ]);
    const isPortalUser = !!portalUser;
    const role = (profile as { role?: string } | null)?.role;

    if (isPortalUser && (path.startsWith('/dashboard') || path.startsWith('/today') || path.startsWith('/job/'))) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    if (role === 'crew' && (path.startsWith('/dashboard') || path.startsWith('/portal'))) {
      // Measure is shared between roles — crew use it for field
      // suggestions; owner/dispatcher use it to draft proposals. Allow.
      if (!path.startsWith('/dashboard/measure')) {
        return NextResponse.redirect(new URL('/today', request.url));
      }
    }
    if ((role === 'owner' || role === 'dispatcher') && path.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|css|js|ico)$).*)'],
};
