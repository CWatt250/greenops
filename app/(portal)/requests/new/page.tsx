'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RequestForm } from '@/components/portal/request-form';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { Service } from '@/types';

export default function NewRequestPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<{ clientId: string; companyId: string; portalUserId: string; services: Service[] } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase.from('portal_users').select('client_id, company_id').eq('id', user.id).single();
      if (!pu) { setLoading(false); return; }

      const { data: svcData } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', pu.company_id)
        .eq('is_active', true)
        .order('name');

      setCtx({
        clientId: pu.client_id,
        companyId: pu.company_id,
        portalUserId: user.id,
        services: (svcData ?? []) as Service[],
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="px-4 py-5 space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-xl font-bold text-gray-900">New Request</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : ctx ? (
        <RequestForm {...ctx} />
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">Unable to load portal data.</p>
      )}
    </div>
  );
}
