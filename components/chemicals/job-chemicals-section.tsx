'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ApplicationForm } from './application-form';
import { activeReentry } from '@/lib/chemicals';
import { SprayCan, ShieldAlert } from 'lucide-react';
import type { ChemicalApplication } from '@/types';

interface Props {
  clientId: string;
  jobId: string;
  companyId: string;
  userId: string;
}

/**
 * Crew-facing chemical strip for a job page: warns when the property is
 * still inside a re-entry interval, and opens the application logger.
 */
export function JobChemicalsSection({ clientId, jobId, companyId, userId }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [rei, setRei] = useState<{ until: Date; productName: string | null } | null>(null);

  const fetchRei = useCallback(async () => {
    const { data } = await supabase
      .from('chemical_applications')
      .select('reentry_until, product_id, product:chemical_products(name)')
      .eq('client_id', clientId)
      .gt('reentry_until', new Date().toISOString());
    return activeReentry((data ?? []) as unknown as ChemicalApplication[]);
  }, [clientId, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchRei();
      if (!cancelled) setRei(r);
    })();
    return () => { cancelled = true; };
  }, [fetchRei]);

  return (
    <>
      {rei && (
        <div className="rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              <span className="font-semibold">Re-entry interval active</span>
              {rei.productName ? ` (${rei.productName})` : ''} — treated areas are
              off-limits until{' '}
              <span className="font-semibold">
                {rei.until.toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-1.5 text-xs font-medium"
        style={{ color: 'var(--orange-deep)' }}
      >
        <SprayCan className="h-3.5 w-3.5" />
        Log chemical application
      </button>

      <ApplicationForm
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        userId={userId}
        clientId={clientId}
        jobId={jobId}
        onSaved={() => { fetchRei().then(setRei); }}
      />
    </>
  );
}
