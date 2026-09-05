'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { QuickAddMenu } from '@/components/layout/quick-add-menu';
import { NotificationBell } from '@/components/shared/notification-bell';
import { AnnounceButton } from '@/components/dashboard/announce-button';
import { Button } from '@/components/ui/button';
import { Menu, ChevronLeft } from 'lucide-react';
import { WelcomeTour } from '@/components/help/welcome-tour';
import { HelpButton } from '@/components/help/help-button';

export type DashboardRole = 'owner' | 'dispatcher' | 'crew';

/**
 * Client chrome for /dashboard. The server layout (app/dashboard/layout.tsx)
 * has already verified the session and resolved the role, so nothing here
 * flashes or re-fetches identity.
 *
 * Crew members reach /dashboard/measure (the proxy allows it); they get crew
 * chrome — no owner sidebar/drawer, no megaphone or quick-add (which expose
 * the broadcast composer), and a clear way back to /today.
 */
export function DashboardShell({ role, children }: { role: DashboardRole; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isCrew = role === 'crew';

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — admin only (every link would bounce a crew user). */}
      {!isCrew && (
        <div className="hidden md:flex">
          <Sidebar />
        </div>
      )}

      {/* Mobile nav drawer — admin only. */}
      {!isCrew && <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />}

      {/* Main content. `min-w-0` lets this flex column shrink to the viewport
          instead of growing to its widest child — without it, any wide content
          (e.g. a table) pushes the whole page past the screen on mobile. */}
      <div className={`flex flex-1 flex-col min-w-0 ${isCrew ? '' : 'md:ml-64'}`}>
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
            {isCrew ? (
              <Link
                href="/today"
                className="inline-flex min-h-11 items-center gap-1 pr-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" /> Today
              </Link>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
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
            {/* Broadcast composer + quick-add are dispatcher tools — rendered
                only once we KNOW the viewer isn't crew. */}
            {(role === 'owner' || role === 'dispatcher') && (
              <>
                <AnnounceButton variant="icon" />
                <QuickAddMenu />
              </>
            )}
            {/* Light bar → override the bell's default white tone to a visible,
                bordered circle matching the other top-bar tap targets. */}
            <NotificationBell
              className={`${isCrew ? 'h-11 w-11' : 'h-9 w-9'} rounded-full border bg-background text-foreground hover:bg-accent hover:text-foreground`}
            />
          </div>
        </header>

        {/* Bottom-nav clearance on mobile — safe-area-aware so content isn't
            hidden behind the fixed nav on notched iPhones. */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-8">{children}</main>
      </div>

      {!isCrew && (
        <Suspense fallback={null}>
          <WelcomeTour />
        </Suspense>
      )}
      <HelpButton />
      <MobileBottomNav role={role} />
    </div>
  );
}
