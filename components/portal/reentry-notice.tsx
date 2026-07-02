'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { activeReentry } from '@/lib/chemicals';
import { ShieldAlert } from 'lucide-react';
import type { ChemicalApplication } from '@/types';

/**
 * Customer-facing re-entry notice: shown while any chemical application on
 * their property is inside its re-entry interval (reads via the portal RLS
 * policy from migration 053).
 */
export function ReentryNotice({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const [rei, setRei] = useState<{ until: Date; productName: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('chemical_applications')
        .select('reentry_until, product_id, product:chemical_products(name)')
        .eq('client_id', clientId)
        .gt('reentry_until', new Date().toISOString());
      if (!cancelled) {
        setRei(activeReentry((data ?? []) as unknown as ChemicalApplication[]));
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, supabase]);

  if (!rei) return null;

  return (
    <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            Your lawn was recently treated
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Please keep people and pets off treated areas until{' '}
            <span className="font-semibold">
              {rei.until.toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
            . It&apos;s safe to re-enter after that.
          </p>
        </div>
      </div>
    </div>
  );
}
