/**
 * Client-side crash reporter used by the error boundaries. Fire-and-forget;
 * never throws. Sends to /api/errors, which stores the report and notifies
 * the company's owner (see that route for the dedupe rules).
 */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const payload = JSON.stringify({
      message: error.message || String(error),
      stack: error.stack ?? null,
      digest: error.digest ?? null,
      path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/errors', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch {
    /* never let reporting throw */
  }
}
