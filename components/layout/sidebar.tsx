'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Briefcase, Wrench, UsersRound, Settings, LogOut,
  CalendarDays, RadioTower, Route, FileText, Wallet, BarChart2, Globe,
  ClipboardCheck, Ruler,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavGroup = { section: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    section: 'Daily',
    items: [
      { href: '/dashboard',          label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/schedule', label: 'Schedule',  icon: CalendarDays },
      { href: '/dashboard/routes',   label: 'Routes',    icon: Route },
      { href: '/dashboard/crew',     label: 'Dispatch',  icon: RadioTower },
    ],
  },
  {
    section: 'Records',
    items: [
      { href: '/dashboard/clients',  label: 'Clients',          icon: Users },
      { href: '/dashboard/jobs',     label: 'Jobs',             icon: Briefcase },
      { href: '/dashboard/measure',  label: 'Measure Property', icon: Ruler },
      { href: '/dashboard/crews',    label: 'Crews',            icon: UsersRound },
      { href: '/dashboard/services', label: 'Services',         icon: Wrench },
    ],
  },
  {
    section: 'Money',
    items: [
      { href: '/dashboard/proposals', label: 'Proposals', icon: ClipboardCheck },
      { href: '/dashboard/invoices',  label: 'Invoices',  icon: FileText },
      { href: '/dashboard/billing',   label: 'Billing',   icon: Wallet },
    ],
  },
  {
    section: 'Insight',
    items: [
      { href: '/dashboard/analytics',    label: 'Analytics',    icon: BarChart2 },
      { href: '/dashboard/portal-admin', label: 'Portal Inbox', icon: Globe },
      { href: '/dashboard/settings',     label: 'Settings',     icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function NavLink({ href, label, icon: Icon }: NavItem) {
    const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
    return (
      <li>
        <Link
          href={href}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
            isActive
              ? 'bg-[var(--orange)] text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon className="h-4 w-4 shrink-0 opacity-90" />
          <span>{label}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--moss-800)]"
      style={{ backgroundColor: '#000' }}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-4 text-center border-b border-[var(--moss-800)]">
        <Image
          src="/tlc-logo.png"
          alt="TLC Landscape Management"
          width={200}
          height={120}
          className="mx-auto mb-2 h-auto w-full max-w-[200px]"
          priority
        />
        <p
          className="text-white uppercase leading-tight mt-1"
          style={{
            fontFamily: 'var(--font-display), Impact, sans-serif',
            fontSize: '13px',
            letterSpacing: '0.12em',
          }}
        >
          Management Platform
        </p>
        <p
          className="mt-0.5"
          style={{
            fontFamily: 'var(--font-hand), cursive',
            fontSize: '18px',
            color: 'var(--orange)',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          by Watt Systems
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {navGroups.map((group) => (
          <div key={group.section} className="mb-2">
            <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sage-300)] opacity-75">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => <NavLink key={item.href} {...item} />)}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--moss-800)] px-3 py-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
