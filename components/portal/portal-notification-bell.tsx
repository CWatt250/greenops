'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalNotification } from '@/types';

interface Props {
  portalUserId: string;
}

export function PortalNotificationBell({ portalUserId }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);

  async function loadNotifications() {
    const { data } = await supabase
      .from('portal_notifications')
      .select('*')
      .eq('portal_user_id', portalUserId)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as PortalNotification[]);
  }

  useEffect(() => {
    loadNotifications();
    const ch = supabase
      .channel(`portal-notifs-${portalUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'portal_notifications',
        filter: `portal_user_id=eq.${portalUserId}`,
      }, () => loadNotifications())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [portalUserId]);

  const unread = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    await supabase
      .from('portal_notifications')
      .update({ read: true })
      .eq('portal_user_id', portalUserId)
      .eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); if (open && unread > 0) markAllRead(); }}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <Bell className="h-5 w-5 text-white" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl bg-white shadow-2xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn('px-4 py-3', !n.read && 'bg-green-50')}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
