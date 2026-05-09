'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Stable id used for localStorage key. e.g. "schedule", "forms". */
  id: string;
  title: string;
  description: string;
  /** Numbered "Quick start" steps. */
  steps?: string[];
}

const STORAGE_PREFIX = 'tlc.help.intro.';

export function PageIntro({ id, title, description, steps }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
      setVisible(dismissed !== '1');
    } catch {
      setVisible(true);
    }
  }, [id]);

  function dismiss() {
    try { window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1'); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      data-help-intro={id}
      className="rounded-xl border bg-[var(--orange-soft)] border-l-4 px-4 py-3 mb-5 flex items-start gap-3"
      style={{ borderLeftColor: 'var(--orange)' }}
      role="region"
      aria-label={`${title} introduction`}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        <Lightbulb className="h-4 w-4" />
      </div>
      <div className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--orange-deep)' }}>
        <p className="font-bold uppercase tracking-wide text-[11px] mb-0.5">
          {title}
        </p>
        <p className="mb-1.5">{description}</p>
        {steps && steps.length > 0 && (
          <>
            <p className="font-semibold text-[10px] uppercase tracking-wide mt-1.5 mb-0.5 opacity-80">
              Quick start
            </p>
            <ol className="space-y-0.5 list-decimal list-inside marker:text-[var(--orange)]">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={dismiss}
        className="shrink-0 text-[var(--orange-deep)] hover:bg-[var(--orange-soft)]/60 gap-1"
        aria-label="Dismiss help banner"
      >
        <X className="h-3.5 w-3.5" /> Got it
      </Button>
    </div>
  );
}

/** Force-clear all dismissed-banner flags. Used by the "?tour=1" replay. */
export function resetAllPageIntros() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {}
}
