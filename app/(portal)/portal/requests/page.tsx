'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RequestCard } from '@/components/portal/request-card';
import { LiveIndicator } from '@/components/shared/live-indicator';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { Loader2, Plus } from 'lucide-react';
import type { ServiceRequest } from '@/types';

export default function PortalRequestsPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase
        .from('portal_users').select('client_id').eq('id', user.id).single();
      if (cancelled) return;
      setClientId((pu as { client_id?: string } | null)?.client_id ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from('service_requests')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setRequests((data ?? []) as ServiceRequest[]);
    setLoading(false);
  }, [clientId, supabase]);

  const { status, updatedAt } = useLiveData({
    channelKey: clientId ? `portal-requests-${clientId}` : 'portal-requests',
    tables: clientId ? [{ table: 'service_requests', filter: `client_id=eq.${clientId}` }] : [],
    loader: loadRequests,
    enabled: !!clientId,
  });

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service Requests</h1>
          <LiveIndicator status={status} updatedAt={updatedAt} className="mt-0.5" />
        </div>
        <Link
          href="/portal/requests/new"
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
        >
          <Plus className="h-4 w-4" /> New
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">📋</p>
          <p className="text-sm font-medium text-gray-600">No requests yet</p>
          <Link
            href="/portal/requests/new"
            className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
            style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
          >
            Make Your First Request
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard key={req.id} request={req} />
          ))}
        </div>
      )}
    </div>
  );
}
