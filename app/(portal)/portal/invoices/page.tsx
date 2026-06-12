'use client';

import { useCallback, useEffect, useState } from 'react';
import { localDateStr } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { InvoiceCard } from '@/components/portal/invoice-card';
import { LiveIndicator } from '@/components/shared/live-indicator';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { Loader2 } from 'lucide-react';
import type { Invoice } from '@/types';

export default function PortalInvoicesPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase
        .from('portal_users')
        .select('client_id')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      setClientId((pu as { client_id?: string } | null)?.client_id ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInvoices = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .not('status', 'eq', 'draft')
      .order('issued_date', { ascending: false });

    const now = localDateStr();
    const processed = (data ?? []).map((inv) => ({
      ...inv,
      status: (inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date && inv.due_date < now)
        ? 'overdue' : inv.status,
    })) as Invoice[];

    setInvoices(processed);
    setLoading(false);
  }, [clientId, supabase]);

  const { status, updatedAt } = useLiveData({
    channelKey: clientId ? `portal-invoices-${clientId}` : 'portal-invoices',
    tables: clientId ? [{ table: 'invoices', filter: `client_id=eq.${clientId}` }] : [],
    loader: loadInvoices,
    enabled: !!clientId,
  });

  const outstanding = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled');
  const paid = invoices.filter((i) => i.status === 'paid');

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
        <LiveIndicator status={status} updatedAt={updatedAt} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">💰</p>
          <p className="text-sm text-gray-500">No invoices yet</p>
        </div>
      ) : (
        <>
          {outstanding.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</p>
              {outstanding.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} isOverdue={inv.status === 'overdue'} />
              ))}
            </div>
          )}
          {paid.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</p>
              {paid.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
