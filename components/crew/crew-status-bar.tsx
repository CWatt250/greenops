'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2, Wifi, WifiOff, Inbox } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { drainQueue, queueLength } from '@/lib/offline-queue';
import { cn } from '@/lib/utils';

interface Props {
  /** Date to show alongside the indicators. */
  todayLabel: string;
}

/**
 * Top status bar for the crew /today page. Shows:
 *   - "Online" / "Offline" indicator
 *   - Queued mutations count (drains automatically when reconnect fires)
 *   - Sign-out button (red, far right)
 *
 * The /today server component renders this client island.
 */
export function CrewStatusBar({ todayLabel }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setOnline(window.navigator.onLine);
    setPending(queueLength());

    const onOnline = async () => {
      setOnline(true);
      const replayed = await drainQueue(supabase);
      setPending(queueLength());
      if (replayed > 0) router.refresh();
    };
    const onOffline = () => setOnline(false);
    const onStorage = () => setPending(queueLength());

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', onStorage);

    // First-mount drain in case we came back online while the tab was closed.
    if (window.navigator.onLine) {
      drainQueue(supabase).then((replayed) => {
        setPending(queueLength());
        if (replayed > 0) router.refresh();
      });
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', onStorage);
    };
  }, [router, supabase]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider',
            online ? 'text-emerald-600' : 'text-rose-600',
          )}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? 'Online' : 'Offline — your taps will sync'}
        </span>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
            <Inbox className="h-3 w-3" /> {pending} queued
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">{todayLabel}</span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
      >
        {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        {signingOut ? '…' : 'Sign out'}
      </button>
    </div>
  );
}
