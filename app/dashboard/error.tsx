'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { reportClientError } from '@/lib/report-error';

/** Keeps the sidebar and nav intact when a single dashboard page throws. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard error]', error);
    reportClientError(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center">
      <h1 className="text-lg font-bold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The rest of the app is fine. Try again, or pick another page from the menu.
      </p>
      {error.digest && <p className="mt-3 font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>}
      <Button onClick={reset} className="mt-5 text-white" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
        <RefreshCw className="mr-2 h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
