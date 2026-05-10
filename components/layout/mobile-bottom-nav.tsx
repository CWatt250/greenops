'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, CalendarDays, Ruler, Users, MoreHorizontal,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { MobileMoreDrawer } from './mobile-more-drawer';

type Role = 'owner' | 'dispatcher' | 'crew' | 'customer' | null;

interface NavItem {
  label: string;
  /** Routable destination. The sentinel "__more__" turns the tab into a
   *  button that opens the More drawer instead of navigating. */
  href: string;
  icon: React.ElementType;
  match?: (path: string) => boolean;
  /** When true, render as the elevated center "primary action" tab. */
  primary?: boolean;
}

interface Props {
  /** Override role detection. Layouts that already know the role can
   *  pass it; otherwise the component fetches it once on mount. */
  role?: Role;
}

const ADMIN_TABS: NavItem[] = [
  { label: 'Home',     href: '/dashboard',                   icon: Home,
    match: (p) => p === '/dashboard' },
  { label: 'Schedule', href: '/dashboard/schedule?view=day', icon: CalendarDays,
    match: (p) => p.startsWith('/dashboard/schedule') },
  { label: 'Measure',  href: '/dashboard/measure',           icon: Ruler,
    match: (p) => p.startsWith('/dashboard/measure'),
    primary: true },
  { label: 'Clients',  href: '/dashboard/clients',           icon: Users,
    match: (p) => p.startsWith('/dashboard/clients') },
  { label: 'More',     href: '__more__',                     icon: MoreHorizontal },
];

const CREW_TABS: NavItem[] = [
  { label: 'Today',    href: '/today',             icon: ClipboardList,
    match: (p) => p === '/today' || p.startsWith('/job/') || p.startsWith('/complete/') },
  { label: 'Measure',  href: '/dashboard/measure', icon: Ruler,
    match: (p) => p.startsWith('/dashboard/measure'),
    primary: true },
  { label: 'More',     href: '__more__',           icon: MoreHorizontal },
];

export function MobileBottomNav({ role: roleProp }: Props) {
  const pathname = usePathname() ?? '/';
  const [moreOpen, setMoreOpen] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<Role>(roleProp ?? null);
  const [loading, setLoading] = useState(roleProp === undefined);

  useEffect(() => {
    if (roleProp !== undefined) {
      setResolvedRole(roleProp);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (cancelled) return;
      const r = (data as { role?: Role } | null)?.role ?? null;
      setResolvedRole(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roleProp]);

  /* Don't return null during loading — keep the nav mounting position
   * stable so PWA service-worker caches don't lose it forever.  Render
   * a non-interactive placeholder that becomes visible once the role is
   * fetched.  This eliminates the iOS PWA flash-of-no-nav problem. */
  if (resolvedRole === 'customer' || (resolvedRole === null && !loading)) return null;
  if (resolvedRole === null && loading) {
    return (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background opacity-0 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-hidden="true"
      >
        <ul className="flex items-stretch">
          <li className="flex-1" />
          <li className="flex-1" />
          <li className="flex-1 flex justify-center" />
          <li className="flex-1" />
          <li className="flex-1" />
        </ul>
      </nav>
    );
  }

  const tabs = resolvedRole === 'crew' ? CREW_TABS : ADMIN_TABS;

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary navigation"
      >
        <ul className="flex items-stretch">
          {tabs.map((tab) => {
            const active = tab.href === '__more__'
              ? moreOpen
              : (tab.match ? tab.match(pathname) : pathname === tab.href);
            const Icon = tab.icon;

            const inner = tab.primary ? (
              <span
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-2 ring-background transition-transform',
                  active ? 'scale-100' : 'scale-95',
                )}
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                <Icon className="h-6 w-6" />
              </span>
            ) : (
              <Icon className="h-5 w-5" />
            );

            const labelEl = tab.primary ? (
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: active ? 'var(--orange)' : 'var(--muted-foreground)' }}
              >
                {tab.label}
              </span>
            ) : (
              <span className="text-[10px] font-semibold">{tab.label}</span>
            );

            const itemClass = tab.primary
              ? 'relative -translate-y-3 flex flex-col items-center justify-center gap-0.5'
              : cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 transition-colors w-full',
                  active ? 'text-foreground' : 'text-muted-foreground',
                );

            return (
              <li
                key={tab.label}
                className={tab.primary ? 'flex-1 flex justify-center' : 'flex-1'}
              >
                {tab.href === '__more__' ? (
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={itemClass}
                    style={!tab.primary && active ? { color: 'var(--orange)' } : undefined}
                    aria-pressed={active}
                  >
                    {inner}
                    {labelEl}
                  </button>
                ) : (
                  <Link
                    href={tab.href}
                    className={itemClass}
                    style={!tab.primary && active ? { color: 'var(--orange)' } : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {inner}
                    {labelEl}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <MobileMoreDrawer open={moreOpen} onOpenChange={setMoreOpen} role={resolvedRole} />
    </>
  );
}
