'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RequestQueue } from '@/components/portal-admin/request-queue';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceRequest, ServiceRequestStatus } from '@/types';

const TABS: { label: string; statuses: ServiceRequestStatus[] }[] = [
  { label: 'Pending', statuses: ['pending'] },
  { label: 'Reviewing', statuses: ['reviewing'] },
  { label: 'Scheduled', statuses: ['scheduled'] },
  { label: 'All', statuses: ['pending', 'reviewing', 'scheduled', 'completed', 'declined'] },
];

export default function PortalAdminRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: profile } = await (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { data: null };
        return supabase.from('profiles').select('company_id').eq('id', user.id).single();
      })();
      if (!profile) { setLoading(false); return; }

      const { data } = await supabase
        .from('service_requests')
        .select('*, client:clients(name), service:services(name)')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      setRequests((data ?? []) as ServiceRequest[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = requests.filter((r) =>
    (TABS[tab].statuses as string[]).includes(r.status)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Service Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Requests submitted through the customer portal.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t, i) => {
          const count = requests.filter((r) => (t.statuses as string[]).includes(r.status)).length;
          return (
            <button
              key={t.label}
              onClick={() => setTab(i)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === i ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <RequestQueue
          requests={filtered}
          onUpdate={(updated) => setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
        />
      )}
    </div>
  );
}
