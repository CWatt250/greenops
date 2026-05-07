'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ComplaintCard } from '@/components/portal/complaint-card';
import { Loader2, Plus } from 'lucide-react';
import type { Complaint } from '@/types';

export default function PortalComplaintsPage() {
  const supabase = createClient();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase.from('portal_users').select('client_id').eq('id', user.id).single();
      if (!pu) { setLoading(false); return; }

      const { data } = await supabase
        .from('complaints')
        .select('*')
        .eq('client_id', pu.client_id)
        .order('created_at', { ascending: false });

      setComplaints((data ?? []) as Complaint[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Reported Issues</h1>
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
