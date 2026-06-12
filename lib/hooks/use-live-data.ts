'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type LiveStatus = 'connecting' | 'live' | 'polling' | 'offline';

interface RealtimeFilter {
  table: string;
  /** "*" by default — narrow if the page only cares about INSERT or UPDATE. */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  /** Optional postgres_changes filter, e.g. "client_id=eq.<uuid>". Required
   *  for portal pages so we don't leak cross-customer events. */
  filter?: string;
}

interface UseLiveDataOptions {
  /** Stable channel id — use a per-page string. */
  channelKey: string;
  /** Tables to watch. Each becomes a postgres_changes listener that triggers
   *  a re-fetch via `loader`. */
  tables: RealtimeFilter[];
  /** Fired on initial mount, on any Realtime push, and on every polling tick. */
  loader: () => Promise<void> | void;
  /** Polling cadence. Defaults to 30s — same as the dispatch fix. */
  pollMs?: number;
  /** Disable the polling loop entirely (used for low-priority pages). */
  disablePolling?: boolean;
  /** Skip until the page knows what to query (e.g., still resolving auth). */
  enabled?: boolean;
}

/**
 * Realtime + polling safety net for portal/dispatch pages.
 *
 * Caller passes a `loader()` and one or more table+filter triples; we
 * run the loader on mount, on every Realtime push for those tables,
 * and on a 30s interval. Status reflects whichever channel is currently
 * delivering ("live" if Realtime is healthy, "polling" if it dropped,
 * "offline" if the device itself lost connectivity).
 */
export function useLiveData({
  channelKey,
  tables,
  loader,
  pollMs = 30_000,
  disablePolling = false,
  enabled = true,
}: UseLiveDataOptions) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // null until the first load completes: a render-time `new Date()` bakes
  // the server's clock into the SSR'd HTML and the client's into hydration —
  // a guaranteed mismatch across a second boundary (the app's recurring dev
  // hydration error, traced here via LiveIndicator's timestamp).
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const lastRtAtRef = useRef<number>(0);

  // Stable refs so the effects don't re-run when the caller forgets to
  // useCallback the loader.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  const runLoader = useCallback(async () => {
    await loaderRef.current();
    setUpdatedAt(new Date());
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;
    runLoader();
  }, [enabled, runLoader]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    setStatus('connecting');

    const channel: RealtimeChannel = supabase.channel(channelKey);

    for (const t of tablesRef.current) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: t.event ?? '*',
          schema: 'public',
          table: t.table,
          ...(t.filter ? { filter: t.filter } : {}),
        },
        () => {
          lastRtAtRef.current = Date.now();
          runLoader();
        },
      );
    }

    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        lastRtAtRef.current = Date.now();
        setStatus('live');
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        setStatus('polling');
      } else if (s === 'CLOSED') {
        setStatus((prev) => (prev === 'offline' ? 'offline' : 'polling'));
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, channelKey, runLoader]);

  // Polling safety net
  useEffect(() => {
    if (!enabled || disablePolling) return;
    const id = window.setInterval(() => {
      runLoader();
      const elapsed = Date.now() - lastRtAtRef.current;
      setStatus((prev) => {
        if (prev === 'offline') return 'offline';
        if (elapsed > 60_000 && prev === 'live') return 'polling';
        return prev;
      });
    }, pollMs);
    return () => window.clearInterval(id);
  }, [enabled, disablePolling, pollMs, runLoader]);

  // Online/offline awareness
  useEffect(() => {
    if (!enabled) return;
    const onOffline = () => setStatus('offline');
    const onOnline = () => { setStatus('connecting'); runLoader(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, runLoader]);

  return { status, updatedAt };
}
