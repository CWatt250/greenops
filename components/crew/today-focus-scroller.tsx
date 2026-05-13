'use client';

// Tiny client island that handles ?focus=<jobId> by scrolling the matching
// data-job-id="<jobId>" card into view on mount. Used after the
// /complete/[id] page auto-forwards back to /today: the next-stop card
// snaps to center so the worker doesn't have to hunt for it.

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function TodayFocusScroller() {
  const params = useSearchParams();
  const focus = params.get('focus');

  useEffect(() => {
    if (!focus || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-job-id="${focus}"]`) as HTMLElement | null;
    if (!el) return;
    // Defer one frame so the page has painted.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'box-shadow 600ms ease';
      el.style.boxShadow = '0 0 0 3px var(--orange, #EA580C)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1800);
    });
  }, [focus]);

  return null;
}
