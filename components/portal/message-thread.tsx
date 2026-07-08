'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { LiveIndicator } from '@/components/shared/live-indicator';
import type { Message } from '@/types';

interface Props {
  clientId: string;
  companyId: string;
  senderId: string;
  senderType: 'portal_user' | 'admin';
  senderName?: string;
  /** Used for the admin sender label when portal users see incoming
   *  messages. Falls back to "Support" if not provided. */
  companyName?: string;
}

type MessageWithSender = Message & {
  sender?: { full_name: string | null } | null;
};

export function MessageThread({
  clientId, companyId, senderId, senderType, senderName, companyName,
}: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadId = useRef<string | null>(null);

  void senderName; // reserved for future per-message sender label

  const loadMessages = useCallback(async () => {
    // No profiles embed: messages.sender_id is polymorphic (portal user OR
    // staff profile) with no FK, so `profiles!sender_id` 400s and the whole
    // thread rendered empty for everyone. Sender labels come from
    // sender_type + companyName instead.
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at');

    const msgs = (data ?? []) as MessageWithSender[];
    setMessages(msgs);
    if (msgs.length > 0) threadId.current = msgs[0].thread_id;

    // Mark unread messages from the other side as read.
    const unread = msgs.filter((m) => m.sender_type !== senderType && !m.read_at);
    if (unread.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map((m) => m.id));
    }
  }, [clientId, senderType, supabase]);

  const { status, updatedAt } = useLiveData({
    channelKey: `messages-${clientId}`,
    tables: [{ table: 'messages', event: 'INSERT', filter: `client_id=eq.${clientId}` }],
    loader: loadMessages,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);

    const tid = threadId.current ?? crypto.randomUUID();
    threadId.current = tid;

    const { error } = await supabase.from('messages').insert({
      company_id: companyId,
      client_id: clientId,
      thread_id: tid,
      sender_type: senderType,
      sender_id: senderId,
      body: body.trim(),
    });

    if (!error) {
      // Notify the other side
      if (senderType === 'portal_user') {
        // Server-side fan-out: portal users can't read staff profiles, so
        // the client-side notifyStaff() path would resolve zero recipients.
        await fetch('/api/portal/notify-staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'New portal message',
            body: body.trim().slice(0, 60),
            entityType: 'message',
            entityId: clientId,
          }),
        }).catch(() => {});
      }

      setBody('');
    }
    setSending(false);
  }

  const isPortal = senderType === 'portal_user';

  return (
    <div className="flex flex-col h-full">
      {/* Live indicator */}
      <div className="px-4 py-2 border-b bg-white flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">Messages</p>
        <LiveIndicator status={status} updatedAt={updatedAt} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">💬</p>
            <p className="text-sm font-medium text-gray-600">Start the conversation</p>
            <p className="text-xs text-gray-400 mt-1">
              Send a message to {companyName ?? 'us'}
            </p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = (isPortal && msg.sender_type === 'portal_user') ||
                        (!isPortal && msg.sender_type === 'admin');
          return (
            <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm',
                  isOwn
                    ? 'rounded-br-sm text-white'
                    : 'rounded-bl-sm bg-white border border-gray-200 text-gray-800 border-l-4'
                )}
                style={isOwn
                  ? { backgroundColor: 'var(--color-brand-green-raw)' }
                  : { borderLeftColor: 'var(--color-brand-green-raw)' }
                }
              >
                {!isOwn && (
                  <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--color-brand-green-raw)' }}>
                    {msg.sender?.full_name ?? companyName ?? 'Support'}
                  </p>
                )}
                <p>{msg.body}</p>
                <p className={cn('text-[10px] mt-1', isOwn ? 'text-white/60 text-right' : 'text-gray-400')}>
                  {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="flex items-center gap-2 p-3 border-t bg-white"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
        />
        <Button
          type="submit"
          disabled={!body.trim() || sending}
          size="icon"
          aria-label="Send message"
          className="h-10 w-10 rounded-full shrink-0"
          style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
        >
          <Send className="h-4 w-4 text-white" />
        </Button>
      </form>
    </div>
  );
}
