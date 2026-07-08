'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2, Wifi, WifiOff, Inbox, CloudOff, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { clearCompanyContext } from '@/lib/company-context';
import { drainQueue, queueLength } from '@/lib/offline-queue';
import {
  listCompletions, syncCompletions, onCompletionsChanged, type QueuedCompletion,
} from '@/lib/offline-completion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  /** Date to show alongside the indicators. */
  todayLabel: string;
}

/**
 * Top status bar for the crew /today page. Shows:
 *   - "Online" / "Offline" indicator
 *   - Queued mutations count (drains automatically when reconnect fires)
 *   - Queued offline completions (banner with per-job names + manual sync)
 *   - Sign-out button (red, far right)
 *
 * The /today server component renders this client island.
 */
export function CrewStatusBar({ todayLabel }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [completions, setCompletions] = useState<QueuedCompletion[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function refreshCompletions() {
    try {
      setCompletions(await listCompletions());
    } catch {
      // IndexedDB unavailable (private browsing edge cases) — banner hides.
    }
  }

  async function runSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const [replayed, result] = await Promise.all([
        drainQueue(supabase),
        syncCompletions(supabase),
      ]);
      setPending(queueLength());
      await refreshCompletions();
      if (result.synced.length > 0) {
        toast.success(
          result.synced.length === 1
            ? `Synced: ${result.synced[0].jobTitle} marked complete.`
            : `Synced ${result.synced.length} offline completions.`,
        );
      }
      for (const f of result.failed) {
        toast.error(`${f.jobTitle} couldn't sync: ${f.error}`);
      }
      if (replayed > 0 || result.synced.length > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setOnline(window.navigator.onLine);
    setPending(queueLength());
    refreshCompletions();

    const onOnline = () => { setOnline(true); runSync(); };
    const onOffline = () => setOnline(false);
    const onStorage = () => setPending(queueLength());
    const offChanged = onCompletionsChanged(refreshCompletions);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', onStorage);

    // First-mount drain in case we came back online while the tab was closed.
    if (window.navigator.onLine) runSync();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', onStorage);
      offChanged();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    clearCompanyContext();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
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

      {completions.length > 0 && (
        <div
          data-testid="offline-completions-banner"
          className="mt-2 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <CloudOff className="h-3.5 w-3.5" />
              {completions.length} completion{completions.length === 1 ? '' : 's'} waiting to sync
            </p>
            <button
              type="button"
              onClick={runSync}
              disabled={!online || syncing}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {online ? 'Sync now' : 'No signal'}
            </button>
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700">
            {completions.map((c) => (
              <li key={c.jobId}>
                • {c.clientName ?? c.jobTitle}
                {c.lastError && <span className="text-red-600 font-medium"> — {c.lastError}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
