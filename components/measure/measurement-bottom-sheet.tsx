'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { GripHorizontal } from 'lucide-react';

interface MeasurementBottomSheetProps {
  /** The peek content shown when minimised (e.g. measurement summary). */
  peek: ReactNode;
  /** The full expanded content (shape list, area summary, actions). */
  detail: ReactNode;
  /** Whether there are any shapes drawn. Affects the empty state. */
  hasShapes: boolean;
}

/**
 * A mobile draggable bottom sheet that peeks at ~60px with a drag handle,
 * and expands to 50vh when tapped/dragged up. Collapses back on drag down.
 *
 * Desktop (>md): renders as a static sidebar panel (always expanded).
 */
export function MeasurementBottomSheet({
  peek,
  detail,
  hasShapes,
}: MeasurementBottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    isDragging: boolean;
  }>({ startY: 0, startHeight: 0, isDragging: false });
  const [dragOffset, setDragOffset] = useState(0);
  const BOTTOM_NAV_HEIGHT = 56; // approximate bottom nav height

  const peekHeight = 56;
  const expandedHeight = `calc(50vh - ${BOTTOM_NAV_HEIGHT}px)`;

  function toggle() {
    if (!hasShapes) return;
    setExpanded((prev) => {
      if (!prev) setDragOffset(0);
      return !prev;
    });
  }

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      startY: e.clientY,
      startHeight: expanded ? 0 : peekHeight,
      isDragging: true,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [expanded]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const delta = dragRef.current.startY - e.clientY;
    // Clamp: don't drag above expanded, don't drag below peek
    const maxDrag = window.innerHeight * 0.5 - BOTTOM_NAV_HEIGHT - peekHeight;
    setDragOffset(Math.max(0, Math.min(maxDrag, delta)));
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;

    const threshold = 80; // px toggled threshold
    if (dragOffset > threshold && !expanded) {
      setExpanded(true);
    } else if (dragOffset < threshold && expanded && dragOffset > 0) {
      // Determine if they dragged *down* far enough to collapse
      const dragDown = dragRef.current.startHeight > 0;
      // If dragOffset is small (dragged down from expanded), collapse
      if (dragOffset < -threshold) {
        // This case won't happen with our clamp; we handle via delta below
      }
    }
    setDragOffset(0);
  }, [dragOffset, expanded]);

  // Detect drag-down when expanded: if user swipes down, delta goes negative
  // Since we clamp dragOffset >= 0, we use a second ref for direction.
  const directionRef = useRef<'up' | 'down' | null>(null);

  // × handle via the direction detection embedded in move
  // Re-implemented more cleanly:
  const dragStateRef = useRef<{
    startY: number;
    isDragging: boolean;
    distance: number;
  }>({ startY: 0, isDragging: false, distance: 0 });

  const handlePDown = useCallback((e: React.PointerEvent) => {
    dragStateRef.current = { startY: e.clientY, isDragging: true, distance: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePMove = useCallback((e: React.PointerEvent) => {
    if (!dragStateRef.current.isDragging) return;
    const delta = e.clientY - dragStateRef.current.startY;
    dragStateRef.current.distance = delta;
    // For expanded sheet, negative delta = dragging up = keep expanded
    // Positive delta = dragging down = collapse
    if (expanded) {
      setDragOffset(Math.max(0, Math.min(delta, 300)));
    } else {
      setDragOffset(Math.max(-300, Math.min(0, delta)));
    }
  }, [expanded]);

  const handlePUp = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    const distance = dragStateRef.current.distance;
    const threshold = 80;

    if (expanded && distance > threshold) {
      setExpanded(false);
    } else if (!expanded && distance < -threshold) {
      setExpanded(true);
    }
    setDragOffset(0);
  }, [expanded]);

  const translateY = expanded
    ? `calc(${dragOffset}px)`
    : `calc(${peekHeight}px + ${Math.abs(dragOffset)}px)`;

  // On desktop, render as a static sidebar
  return (
    <>
      {/* Mobile bottom sheet */}
      <div
        ref={sheetRef}
        className="md:hidden fixed left-0 right-0 z-40 bg-background border-t rounded-t-xl shadow-xl transition-transform duration-300 ease-out will-change-transform"
        style={{
          bottom: `${BOTTOM_NAV_HEIGHT}px`,
          transform: expanded
            ? `translateY(${dragOffset}px)`
            : `translateY(calc(${peekHeight - 8}px + ${Math.abs(dragOffset)}px))`,
          maxHeight: expanded ? `calc(50vh - ${BOTTOM_NAV_HEIGHT}px)` : `${peekHeight}px`,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePDown}
          onPointerMove={handlePMove}
          onPointerUp={handlePUp}
        >
          <GripHorizontal className="h-5 w-5 text-muted-foreground/50" />
        </div>

        {/* Peek content (always visible when collapsed) */}
        {!expanded && (
          <div
            className="px-4 pb-3 cursor-pointer"
            onClick={toggle}
          >
            {hasShapes ? peek : (
              <p className="text-xs text-muted-foreground text-center">
                Draw shapes to see measurements
              </p>
            )}
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: `calc(50vh - ${BOTTOM_NAV_HEIGHT + 48}px)` }}>
            {detail}
          </div>
        )}
      </div>

      {/* Desktop: static sidebar — rendered via the existing <aside> in measure-view.tsx */}
    </>
  );
}
