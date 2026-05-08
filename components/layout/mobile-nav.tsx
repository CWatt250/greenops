'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, Briefcase, Wrench, UsersRound, Settings, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard',          label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/dashboard/clients',  label: 'Clients',         icon: Users },
  { href: '/dashboard/jobs',     label: 'Jobs',            icon: Briefcase },
  { href: '/dashboard/schedule', label: 'Schedule',        icon: CalendarDays },
  { href: '/dashboard/services', label: 'Service Catalog', icon: Wrench },
  { href: '/dashboard/crews',    label: 'Crews',           icon: UsersRound },
  { href: '/dashboard/settings', label: 'Settings',        icon: Settings },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-64 border-r-[var(--moss-800)]" style={{ backgroundColor: '#000' }}>
        <SheetHeader className="px-5 pt-6 pb-4 border-b border-[var(--moss-800)] text-center">
          <SheetTitle className="sr-only">TLC Management Platform</SheetTitle>
          <Image
            src="/tlc-logo.png"
            alt="TLC Landscape Management"
            width={180}
            height={108}
            className="mx-auto mb-2 h-auto w-full max-w-[180px]"
          />
          <p
            className="text-white uppercase leading-tight"
            style={{
              fontFamily: 'var(--font-display), Impact, sans-serif',
              fontSize: '12px',
              letterSpacing: '0.12em',
            }}
          >
            Management Platform
          </p>
          <p
            className="mt-0.5"
            style={{
              fontFamily: 'var(--font-hand), cursive',
              fontSize: '17px',
              color: 'var(--orange)',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            by Watt Systems
          </p>
        </SheetHeader>
        <nav className="py-4 px-3">
          <ul className="space-y-0.5">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
                      isActive
                        ? 'bg-[var(--orange)] text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
