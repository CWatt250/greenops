'use client';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, so
 * it must render its own <html>/<body> and cannot rely on app fonts or CSS.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F5F5F0', color: '#1C2B1A' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>TLC Management Platform hit an error</h1>
            <p style={{ color: '#5C665A', fontSize: 14 }}>Reload to continue. If this keeps happening, contact support.</p>
            {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#5C665A' }}>ref {error.digest}</p>}
            <button
              onClick={reset}
              style={{ marginTop: 16, background: '#3D6B2C', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
