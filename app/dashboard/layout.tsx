'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { QuickAddMenu } from '@/components/layout/quick-add-menu';
import { NotificationBell } from '@/components/shared/notification-bell';
import { Button } from '@/components/ui/button';
import { Menu, Ruler } from 'lucide-react';
import { WelcomeTour } from '@/components/help/welcome-tour';
import { HelpButton } from '@/components/help/help-button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile nav drawer */}
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />

      {/* Main content */}
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background px-3 md:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span
              className="uppercase"
              style={{
                fontFamily: 'var(--font-display), Impact, sans-serif',
                fontSize: '13px',
                letterSpacing: '0.1em',
              }}
            >
              TLC
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/dashboard/measure"
              aria-label="Measure property"
              title="Measure property"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border"
              style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'var(--orange)' }}
            >
              <Ruler className="h-4 w-4" />
            </Link>
            <QuickAddMenu />
            <NotificationBell />
          </div>
        </header>

        {/* Bottom-nav clearance on mobile — safe-area-aware so content isn't
            hidden behind the fixed nav on notched iPhones. */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-8">{children}</main>
      </div>

      <Suspense fallback={null}>
        <WelcomeTour />
      </Suspense>
      <HelpButton />
      <MobileBottomNav />
    </div>
  );
}
