'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

export function NotificationBell({ className }: { className?: string } = {}) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as Notification[]);
  }, [userId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime: listen for new notifications for this user
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  async function markAllRead() {
    if (!userId) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  function handleOpen(v: boolean) {
    setOpen(v);
    if (v) markAllRead();
  }

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        aria-label="Notifications"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          // Default tone suits the crew's black bar; the dashboard's light bar
          // passes `className` to override to a visible, bordered circle.
          'relative text-white hover:bg-white/10 hover:text-white',
          className
        )}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
          ) : (
            notifications.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Separator />}
                <button
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors',
                    !n.is_read && 'bg-primary/5'
                  )}
                  onClick={() => markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                    <div className={cn('flex-1', n.is_read && 'ml-4')}>
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
