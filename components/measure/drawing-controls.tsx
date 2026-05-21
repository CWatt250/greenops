'use client';

import { MapPin, Check, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  pointCount: number;
  tool: 'polygon' | 'line' | null;
  onAddPoint: () => void;
  onCloseShape: () => void;
  onUndoPoint: () => void;
  onCancel: () => void;
}

/**
 * Compact single-row drawing controls. Replaces the previous stacked layout
 * (full-width Add Point + Close + instruction banner) that consumed ~280px
 * of vertical space. This bar is ~56px tall so the user keeps maximum map
 * area for precise crosshair positioning.
 */
export function DrawingControls({
  pointCount,
  tool,
  onAddPoint,
  onCloseShape,
  onUndoPoint,
  onCancel,
}: Props) {
  if (!tool) return null;
  const canClose =
    (tool === 'polygon' && pointCount >= 3) ||
    (tool === 'line' && pointCount >= 2);

  return (
    <div className="pointer-events-auto w-full px-3">
      <div className="flex items-center gap-1.5 rounded-2xl border bg-background/95 backdrop-blur-sm shadow-lg p-1.5 max-w-full">
        {/* Add Point — primary, takes most width */}
        <button
          type="button"
          onClick={onAddPoint}
          className="flex-1 min-w-0 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 shadow"
          style={{ backgroundColor: '#F15A24' }}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">Add Point</span>
          {pointCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-white/25 text-white text-[11px] font-bold px-1.5 shrink-0">
              {pointCount}
            </span>
          )}
        </button>
        {/* Close shape — secondary, shown once enough points */}
        <button
          type="button"
          onClick={onCloseShape}
          disabled={!canClose}
          className={cn(
            'shrink-0 h-12 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1 border-2 transition-opacity',
            !canClose && 'opacity-40 cursor-not-allowed',
          )}
          style={{
            backgroundColor: 'var(--orange-soft)',
            color: 'var(--orange-deep)',
            borderColor: '#F15A24',
          }}
          aria-label="Close shape"
        >
          <Check className="h-4 w-4" />
          <span className="hidden xs:inline">Close</span>
        </button>
        {/* Undo last point */}
        <button
          type="button"
          onClick={onUndoPoint}
          disabled={pointCount === 0}
          className={cn(
            'shrink-0 h-12 w-12 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity',
            pointCount === 0 && 'opacity-40 cursor-not-allowed',
          )}
          aria-label="Undo last point"
          title="Undo last point"
        >
          <Undo2 className="h-5 w-5" />
        </button>
        {/* Cancel — exit drawing mode */}
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive"
          aria-label="Cancel drawing"
          title="Cancel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
