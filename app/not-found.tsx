import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <p
          className="uppercase"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontSize: '40px', lineHeight: 1, color: 'var(--color-brand-green-raw)' }}
        >
          404
        </p>
        <h1 className="mt-3 text-xl font-bold">That page isn&apos;t here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the record it pointed to was deleted.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
          >
            Go home
          </Link>
          <Link
            href="/dashboard/jobs"
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Jobs list
          </Link>
        </div>
      </div>
    </div>
  );
}
