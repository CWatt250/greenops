'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Briefcase, Wrench, UsersRound, Settings, LogOut, Leaf, CalendarDays, RadioTower, Route, FileText, Wallet, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/',          label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/clients',   label: 'Clients',         icon: Users },
  { href: '/jobs',      label: 'Jobs',            icon: Briefcase },
  { href: '/schedule',  label: 'Schedule',        icon: CalendarDays },
  { href: '/routes',    label: 'Routes',          icon: Route },
  { href: '/crew',      label: 'Dispatch',        icon: RadioTower },
  { href: '/invoices',   label: 'Invoices',        icon: FileText },
  { href: '/billing',    label: 'Billing',         icon: Wallet },
  { href: '/analytics',  label: 'Analytics',       icon: BarChart2 },
  { href: '/services',  label: 'Service Catalog', icon: Wrench },
  { href: '/crews',     label: 'Crews',           icon: UsersRound },
  { href: '/settings',  label: 'Settings',        icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
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
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
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
          })}
        </ul>
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
