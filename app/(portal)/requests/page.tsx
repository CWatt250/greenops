'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RequestCard } from '@/components/portal/request-card';
import { Loader2, Plus } from 'lucide-react';
import type { ServiceRequest } from '@/types';

export default function PortalRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase.from('portal_users').select('client_id').eq('id', user.id).single();
      if (!pu) { setLoading(false); return; }

      const { data } = await supabase
        .from('service_requests')
        .select('*')
        .eq('client_id', pu.client_id)
        .order('created_at', { ascending: false });

      setRequests((data ?? []) as ServiceRequest[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Service Requests</h1>
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
