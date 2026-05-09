'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageThread } from '@/components/portal/message-thread';
import { Loader2 } from 'lucide-react';

export default function PortalMessagesPage() {
  const supabase = createClient();
  const [ctx, setCtx] = useState<{
    clientId: string;
    companyId: string;
    userId: string;
    companyName: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase
        .from('portal_users')
        .select('client_id, company_id, company:companies(name)')
        .eq('id', user.id)
        .single();
      if (pu) {
        const row = pu as unknown as { client_id: string; company_id: string; company: { name?: string } | null };
        setCtx({
          clientId: row.client_id,
          companyId: row.company_id,
          userId: user.id,
          companyName: row.company?.name ?? 'us',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100svh - 3.5rem - 4rem)' }}>
      <div className="px-4 py-4 shrink-0 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <p className="text-xs text-gray-500 mt-0.5">{ctx?.companyName ?? '—'}</p>
      </div>
      {loading ? (
        <div className="flex-1 flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : ctx ? (
        <div className="flex-1 overflow-hidden">
          <MessageThread
            clientId={ctx.clientId}
            companyId={ctx.companyId}
            senderId={ctx.userId}
            senderType="portal_user"
            companyName={ctx.companyName}
          />
        </div>
      ) : (
        <p className="text-center py-16 text-sm text-gray-500">Unable to load messages.</p>
      )}
    </div>
  );
}
