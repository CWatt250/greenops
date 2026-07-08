'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { ComplaintQueue } from '@/components/portal-admin/complaint-queue';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Complaint, ComplaintStatus } from '@/types';

const TABS: { label: string; statuses: ComplaintStatus[] }[] = [
  { label: 'Open', statuses: ['open'] },
  { label: 'Reviewing', statuses: ['reviewing'] },
  { label: 'Resolved', statuses: ['resolved', 'closed'] },
  { label: 'All', statuses: ['open', 'reviewing', 'resolved', 'closed'] },
];

export default function PortalAdminComplaintsPage() {
  const supabase = createClient();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    async function load() {
      const ctx = await getCompanyContext(supabase);
      if (!ctx) { setLoading(false); return; }

      const { data } = await supabase
        .from('complaints')
        .select('*, client:clients(name)')
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false });

      setComplaints((data ?? []) as Complaint[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = complaints.filter((c) =>
    (TABS[tab].statuses as string[]).includes(c.status)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reported Issues</h1>
        <p className="text-sm text-muted-foreground mt-1">Complaints submitted through the customer portal.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t, i) => {
          const count = complaints.filter((c) => (t.statuses as string[]).includes(c.status)).length;
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
        <ComplaintQueue
          complaints={filtered}
          onUpdate={(updated) => setComplaints((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
        />
      )}
    </div>
  );
}
