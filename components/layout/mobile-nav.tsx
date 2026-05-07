'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, Briefcase, Wrench, UsersRound, Settings, Leaf, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/',          label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/clients',   label: 'Clients',         icon: Users },
  { href: '/jobs',      label: 'Jobs',            icon: Briefcase },
  { href: '/schedule',  label: 'Schedule',        icon: CalendarDays },
  { href: '/services',  label: 'Service Catalog', icon: Wrench },
  { href: '/crews',     label: 'Crews',           icon: UsersRound },
  { href: '/settings',  label: 'Settings',        icon: Settings },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-64" style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}>
        <SheetHeader className="px-6 py-5 border-b border-white/10">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand-green-raw)]">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold text-white">TLC Landscape</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="py-4 px-3">
          <ul className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => onOpenChange(false)}
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
      </SheetContent>
    </Sheet>
  );
}
