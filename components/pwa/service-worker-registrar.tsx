'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js once on first paint. We only register in production
 * because Next's dev server hot-reload conflicts with cached HTML and
 * developers shouldn't have to keep clearing storage.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Non-fatal — the app still works, just without offline support.
        });
    };
    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  return null;
}
