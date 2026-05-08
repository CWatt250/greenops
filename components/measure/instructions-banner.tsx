'use client';

import { useEffect, useState } from 'react';
import { X, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'tlc.measure.instructionsHidden';

export function InstructionsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const hidden = window.localStorage.getItem(STORAGE_KEY);
      setVisible(hidden !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="rounded-xl border bg-[var(--orange-soft)] px-4 py-3 m-3 flex items-start gap-3"
      style={{ borderColor: 'var(--orange)' }}
      role="region"
      aria-label="Measurement tool instructions"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        <Ruler className="h-4 w-4" />
      </div>
      <div className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--orange-deep)' }}>
        <p className="font-bold uppercase tracking-wide text-[11px] mb-1">How to measure</p>
        <ol className="space-y-0.5 list-decimal list-inside marker:text-[var(--orange)]">
          <li>Type an address above OR pick a client</li>
          <li>Use the <strong>Polygon</strong> tool to outline lawn areas</li>
          <li>Click around the perimeter, double-click to close</li>
          <li>Each shape gets auto-labeled — click to rename and set its type</li>
          <li>Save when done — auto-applies to proposals</li>
        </ol>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={dismiss}
        className="shrink-0 text-[var(--orange-deep)] hover:bg-[var(--orange-soft)]/60 gap-1"
        aria-label="Hide tips"
      >
        <X className="h-3.5 w-3.5" /> Got it
      </Button>
    </div>
  );
}
