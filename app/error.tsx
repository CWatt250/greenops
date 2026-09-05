'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

/**
 * Route-segment error boundary for everything under the root layout. Keeps
 * the app chrome (fonts, toaster) and offers a retry instead of the raw
 * framework error screen. Errors are logged so a monitoring hook can pick
 * them up in one place.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <p
          className="uppercase text-muted-foreground"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontSize: '12px', letterSpacing: '0.12em' }}
        >
          Something went wrong
        </p>
        <h1 className="mt-2 text-xl font-bold">This page hit an error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing you entered was lost on the server. Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="text-white" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
