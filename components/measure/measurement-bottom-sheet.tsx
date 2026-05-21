'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { GripHorizontal } from 'lucide-react';

interface MeasurementBottomSheetProps {
  /** Compact summary shown when sheet is in the collapsed peek state. */
  peek: ReactNode;
  /** Full content (shape list, totals, pricing, actions). Scrollable. */
  detail: ReactNode;
  /** Whether the user has drawn at least one shape. Drives auto-expand. */
  hasShapes: boolean;
}

type SheetState = 'collapsed' | 'partial' | 'full';

/**
 * Mobile-only draggable bottom sheet with three resting states:
 *   - collapsed: ~80px peek showing total sq ft
 *   - partial:   ~50svh showing shape list + totals
 *   - full:      ~85svh showing pricing + save buttons + proposal CTA
 *
 * Drag the handle up/down to switch states, or tap the handle to cycle.
 * Auto-expands to `partial` the first time a shape is drawn so the user
 * sees their measurement land.
 *
 * Sits above the bottom nav by accounting for safe-area-inset-bottom and the
 * fixed nav height. Desktop (>md) renders nothing — the right-side panel in
 * measure-view.tsx handles that breakpoint.
 */
export function MeasurementBottomSheet({
  peek,
  detail,
  hasShapes,
}: MeasurementBottomSheetProps) {
  const [state, setState] = useState<SheetState>('collapsed');
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{ startY: number; startState: SheetState; active: boolean }>({
    startY: 0,
    startState: 'collapsed',
    active: false,
  });
  const autoExpandedRef = useRef(false);

  // Auto-expand to partial the first time a shape is drawn.
  useEffect(() => {
    if (hasShapes && !autoExpandedRef.current) {
      autoExpandedRef.current = true;
      setState((prev) => (prev === 'collapsed' ? 'partial' : prev));
    }
    if (!hasShapes) {
      autoExpandedRef.current = false;
    }
  }, [hasShapes]);

  const cycleState = useCallback(() => {
    setState((prev) =>
      prev === 'collapsed' ? 'partial' : prev === 'partial' ? 'full' : 'collapsed',
    );
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startY: e.clientY, startState: state, active: true };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragOffset(0);
    },
    [state],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const delta = e.clientY - dragRef.current.startY;
    setDragOffset(delta);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* pointer may not be captured */ }

      const delta = e.clientY - dragRef.current.startY;
      const TAP_THRESHOLD = 6;
      const STEP_THRESHOLD = 60;

      if (Math.abs(delta) < TAP_THRESHOLD) {
        cycleState();
        setDragOffset(0);
        return;
      }

      // Negative delta = dragged up (toward full); positive = dragged down.
      const start = dragRef.current.startState;
      let next: SheetState = start;
      if (delta < -STEP_THRESHOLD) {
        next = start === 'collapsed' ? 'partial' : 'full';
      } else if (delta > STEP_THRESHOLD) {
        next = start === 'full' ? 'partial' : 'collapsed';
      }
      setState(next);
      setDragOffset(0);
    },
    [cycleState],
  );

  // Bottom nav (h-14 + safe-area) sits at the viewport bottom. The sheet
  // anchors directly above it.
  const bottomOffset = 'calc(3.5rem + env(safe-area-inset-bottom, 0px))';
  const sheetHeight =
    state === 'collapsed' ? '80px' : state === 'partial' ? '50svh' : '85svh';
  // Drag-follow translation: positive delta drags the sheet down (decreasing
  // visible height); negative drags it up. We translate the wrapper so the
  // visual responds to the drag without rerunning expensive layouts.
  const translateY = dragRef.current.active
    ? `translateY(${Math.max(-200, Math.min(200, dragOffset))}px)`
    : 'translateY(0)';

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-40 flex flex-col bg-background border-t shadow-[0_-4px_20px_rgba(0,0,0,0.12)] rounded-t-2xl will-change-transform"
      style={{
        bottom: bottomOffset,
        height: sheetHeight,
        maxHeight: `calc(100svh - 6rem)`,
        transform: translateY,
        transition: dragRef.current.active
          ? 'none'
          : 'height 240ms cubic-bezier(0.32, 0.72, 0, 1), transform 240ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      aria-label="Measurement summary"
    >
      {/* Drag handle — large hit area, doubles as tap target to cycle. */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex flex-col items-center justify-center pt-2 pb-1 touch-none select-none cursor-grab active:cursor-grabbing"
        aria-label={
          state === 'collapsed'
            ? 'Expand measurement details'
            : state === 'partial'
              ? 'Show full measurement details'
              : 'Collapse measurement details'
        }
      >
        <span
          className={cn(
            'block h-1 w-10 rounded-full transition-colors',
            state === 'collapsed' ? 'bg-muted-foreground/30' : 'bg-muted-foreground/50',
          )}
        />
        <GripHorizontal className="sr-only" aria-hidden />
      </button>

      {/* Always-visible peek (sticky header). */}
      <div
        className="px-4 pb-2 shrink-0 border-b border-border/50 cursor-pointer"
        onClick={cycleState}
      >
        {peek}
      </div>

      {/* Scrollable detail — only renders when expanded so collapsed sheet
          stays light. */}
      {state !== 'collapsed' && (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 overscroll-contain">
          {detail}
        </div>
      )}
    </div>
  );
}
