'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ComplaintCard } from '@/components/portal/complaint-card';
import { LiveIndicator } from '@/components/shared/live-indicator';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { Loader2, Plus } from 'lucide-react';
import type { Complaint } from '@/types';

export default function PortalComplaintsPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
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

  const loadComplaints = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from('complaints')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setComplaints((data ?? []) as Complaint[]);
    setLoading(false);
  }, [clientId, supabase]);

  const { status, updatedAt } = useLiveData({
    channelKey: clientId ? `portal-complaints-${clientId}` : 'portal-complaints',
    tables: clientId ? [{ table: 'complaints', filter: `client_id=eq.${clientId}` }] : [],
    loader: loadComplaints,
    enabled: !!clientId,
  });

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reported Issues</h1>
          <LiveIndicator status={status} updatedAt={updatedAt} className="mt-0.5" />
        </div>
        <Link
          href="/portal/complaints/new"
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
        >
          <Plus className="h-4 w-4" /> Report
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-sm text-gray-600">No issues reported</p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <ComplaintCard key={c.id} complaint={c} />
          ))}
        </div>
      )}
    </div>
  );
}
