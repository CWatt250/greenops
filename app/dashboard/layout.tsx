'use client';

import { Suspense, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { QuickAddMenu } from '@/components/layout/quick-add-menu';
import { NotificationBell } from '@/components/shared/notification-bell';
import { AnnounceButton } from '@/components/dashboard/announce-button';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
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
        {/* Mobile top bar. Horizontal padding respects the safe-area insets so
            the right-edge controls (notification bell) are never clipped on
            notched / rounded-corner phones. */}
        <header
          className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background px-3 md:hidden"
          style={{
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
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
            {/* Announcement composer — the icon variant renders the orange
                megaphone tap target and self-resolves the company. */}
            <AnnounceButton variant="icon" />
            <QuickAddMenu />
            {/* Light bar → override the bell's default white tone to a visible,
                bordered circle matching the other top-bar tap targets. */}
            <NotificationBell className="h-9 w-9 rounded-full border bg-background text-foreground hover:bg-accent hover:text-foreground" />
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
