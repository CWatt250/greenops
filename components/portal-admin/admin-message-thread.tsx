'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageThread } from '@/components/portal/message-thread';
import { Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

interface ClientThread {
  clientId: string;
  clientName: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
}

interface Props {
  companyId: string;
  adminId: string;
}

export function AdminMessageThread({ companyId, adminId }: Props) {
  const supabase = createClient();
  const [threads, setThreads] = useState<ClientThread[]>([]);
  const [selected, setSelected] = useState<ClientThread | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadThreads() {
    const { data } = await supabase
      .from('messages')
      .select('client_id, body, created_at, read_at, sender_type, client:clients(name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Group by client_id, keep latest message per thread
    const map = new Map<string, ClientThread>();
    for (const msg of data as unknown as (Message & { client: { name: string } | null })[]) {
      if (!map.has(msg.client_id)) {
        map.set(msg.client_id, {
          clientId: msg.client_id,
          clientName: msg.client?.name ?? 'Unknown',
          lastMessage: msg.body,
          lastAt: msg.created_at,
          unreadCount: 0,
        });
      }
      // Count unread portal_user messages
      if (msg.sender_type === 'portal_user' && !msg.read_at) {
        const t = map.get(msg.client_id)!;
        t.unreadCount += 1;
      }
    }

    setThreads(Array.from(map.values()));
    setLoading(false);
  }

  useEffect(() => {
    loadThreads();
    const ch = supabase
      .channel('admin-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, loadThreads)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, loadThreads)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border">
      {/* Thread list */}
      <div className="w-64 border-r shrink-0 overflow-y-auto bg-muted/10">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          threads.map((t) => (
            <button
              key={t.clientId}
              onClick={() => setSelected(t)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b hover:bg-muted/30 transition-colors',
                selected?.clientId === t.clientId && 'bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-sm font-semibold truncate">{t.clientName}</p>
                {t.unreadCount > 0 && (
                  <span className="shrink-0 ml-1 rounded-full text-white text-[10px] font-bold h-4 w-4 flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
                    {t.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{t.lastMessage}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {new Date(t.lastAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Active thread */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b bg-muted/10 shrink-0">
              <p className="font-semibold text-sm">{selected.clientName}</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessageThread
                clientId={selected.clientId}
                companyId={companyId}
                senderId={adminId}
                senderType="admin"
                senderName="TLC Admin"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
