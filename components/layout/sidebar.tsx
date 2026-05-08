'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Briefcase, Wrench, UsersRound, Settings, LogOut, Leaf, CalendarDays, RadioTower, Route, FileText, Wallet, BarChart2, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const mainNav = [
  { href: '/dashboard',           label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/dashboard/clients',   label: 'Clients',         icon: Users },
  { href: '/dashboard/jobs',      label: 'Jobs',            icon: Briefcase },
  { href: '/dashboard/schedule',  label: 'Schedule',        icon: CalendarDays },
  { href: '/dashboard/routes',    label: 'Routes',          icon: Route },
  { href: '/dashboard/crew',      label: 'Dispatch',        icon: RadioTower },
  { href: '/dashboard/invoices',  label: 'Invoices',        icon: FileText },
  { href: '/dashboard/billing',   label: 'Billing',         icon: Wallet },
  { href: '/dashboard/analytics', label: 'Analytics',       icon: BarChart2 },
  { href: '/dashboard/services',  label: 'Service Catalog', icon: Wrench },
  { href: '/dashboard/crews',     label: 'Crews',           icon: UsersRound },
  { href: '/dashboard/settings',  label: 'Settings',        icon: Settings },
];

const portalNav = [
  { href: '/dashboard/portal-admin', label: 'Portal Admin', icon: Globe },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
    return (
      <li>
        <Link
          href={href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-[var(--color-brand-green-raw)] text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col"
      style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--sidebar-border)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand-green-raw)]">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">TLC Landscape</p>
          <p className="text-xs text-white/50">Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        <ul className="space-y-1">
          {mainNav.map((item) => <NavLink key={item.href} {...item} />)}
        </ul>
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">Portal</p>
          <ul className="space-y-1">
            {portalNav.map((item) => <NavLink key={item.href} {...item} />)}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-[var(--sidebar-border)]">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
