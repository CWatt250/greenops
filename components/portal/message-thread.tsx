'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';
import type { Message } from '@/types';

interface Props {
  clientId: string;
  companyId: string;
  senderId: string;
  senderType: 'portal_user' | 'admin';
  senderName?: string;
}

export function MessageThread({ clientId, companyId, senderId, senderType, senderName }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadId = useRef<string | null>(null);

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at');

    const msgs = (data ?? []) as Message[];
    setMessages(msgs);
    if (msgs.length > 0) threadId.current = msgs[0].thread_id;

    // Mark unread admin messages as read
    const unread = msgs.filter((m) => m.sender_type !== senderType && !m.read_at);
    if (unread.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map((m) => m.id));
    }
  }

  useEffect(() => {
    loadMessages();
    const ch = supabase
      .channel(`messages-${clientId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${clientId}`,
      }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clientId]);

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
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', companyId)
          .in('role', ['owner', 'dispatcher']);
        if (admins?.length) {
          await supabase.from('notifications').insert(
            admins.map((a: { id: string }) => ({
              company_id: companyId,
              profile_id: a.id,
              title: 'New portal message',
              body: body.trim().slice(0, 60),
              entity_type: 'message',
              entity_id: clientId,
            }))
          );
        }
      }

      setBody('');
    }
    setSending(false);
  }

  const isPortal = senderType === 'portal_user';

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">💬</p>
            <p className="text-sm font-medium text-gray-600">Start the conversation</p>
            <p className="text-xs text-gray-400 mt-1">Send a message to TLC Landscape Management</p>
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
                    TLC Landscape
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
          className="h-10 w-10 rounded-full shrink-0"
          style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
        >
          <Send className="h-4 w-4 text-white" />
        </Button>
      </form>
    </div>
  );
}
