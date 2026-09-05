'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle, Lightbulb, Play, Mail, X } from 'lucide-react';
import { resetAllPageIntros } from './page-intro';

export function HelpButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function showPageIntro() {
    setOpen(false);
    // Find any data-help-intro on the current page; if none is mounted (because
    // the user dismissed it), reset all of them and reload so the current
    // page's banner re-appears.
    const banner = document.querySelector('[data-help-intro]');
    if (!banner) {
      resetAllPageIntros();
      router.refresh();
    }
    // If the banner already exists, it's already on screen — flash it briefly.
    if (banner instanceof HTMLElement) {
      banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
      banner.style.transition = 'box-shadow 0.4s ease';
      banner.style.boxShadow = '0 0 0 4px rgba(241, 90, 36, 0.4)';
      window.setTimeout(() => {
        banner.style.boxShadow = '';
      }, 1200);
    }
  }

  function replayTour() {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('tour', '1');
    window.location.href = url.toString();
  }

  return (
    <div
      ref={wrapperRef}
      className="fixed bottom-4 right-4 z-40"
    >
      {open && (
        <div
          className="absolute bottom-12 right-0 w-72 rounded-xl border bg-popover shadow-xl ring-1 ring-foreground/10 p-1.5"
          role="menu"
          aria-label="Help"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Help
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close help menu"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={showPageIntro}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
          >
            <Lightbulb className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-xs">
              <span className="block font-semibold">What does this page do?</span>
              <span className="block text-[11px] text-muted-foreground">
                Re-show the intro tip for this page.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={replayTour}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
          >
            <Play className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-xs">
              <span className="block font-semibold">Replay welcome tour</span>
              <span className="block text-[11px] text-muted-foreground">
                Six-step walkthrough.
              </span>
            </span>
          </button>
          <a
            href="https://tlclandscapemanagement.com/learn"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
          >
            <Play className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-xs">
              <span className="block font-semibold">Watch a video</span>
              <span className="block text-[11px] text-muted-foreground">
                Tutorial library — coming soon.
              </span>
            </span>
          </a>
          <a
            href="mailto:support@watt-systems.com?subject=TLC%20Management%20Platform%20question"
            onClick={() => setOpen(false)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
          >
            <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-xs">
              <span className="block font-semibold">Contact Watt Systems</span>
              <span className="block text-[11px] text-muted-foreground">
                support@watt-systems.com
              </span>
            </span>
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg ring-1 ring-foreground/10 hover:scale-105 transition-transform"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        aria-label="Open help menu"
        title="Help"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
