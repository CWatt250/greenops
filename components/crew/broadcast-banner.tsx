'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Megaphone, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Notification } from '@/types';

/**
 * Unread broadcast announcements, surfaced inline at the top of /today.
 * Rain-delay-style messages used to be bell-only — easy to miss before a
 * worker starts their day. Dismissing a card marks the notification read
 * (same row the bell badge counts), so the two stay in sync.
 */
export function BroadcastBanner({ profileId }: { profileId: string }) {
  const supabase = createClient();
  const [broadcasts, setBroadcasts] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .eq('entity_type', 'broadcast')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setBroadcasts((data ?? []) as Notification[]);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function dismiss(id: string) {
    setBroadcasts((prev) => prev.filter((b) => b.id !== id));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }

  if (broadcasts.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="broadcast-banner">
      {broadcasts.map((b) => (
        <div
          key={b.id}
          className="flex items-start gap-3 rounded-xl border-l-4 bg-card px-4 py-3"
          style={{ borderLeftColor: 'var(--orange)', borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1 }}
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--orange-deep)' }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{b.title}</p>
            {b.body && <p className="mt-0.5 text-xs text-muted-foreground">{b.body}</p>}
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {formatDate(b.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(b.id)}
            aria-label="Dismiss announcement"
            className="-m-2 shrink-0 p-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
