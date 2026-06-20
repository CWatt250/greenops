'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render when it flips.
 *
 * CSS-only device capability detection — no user-agent sniffing. The canonical
 * use is `useMediaQuery('(pointer: coarse)')` to light up touch-first UI on
 * phones/tablets while leaving mouse/trackpad desktops (`(pointer: fine)`)
 * byte-identical. Returns `false` on the server and the first client render
 * (before the effect runs), so anything gated on a `true` result is opt-in and
 * SSR-safe — desktop never momentarily renders the touch affordance.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
