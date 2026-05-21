'use client';

import { forwardRef } from 'react';

interface Props {
  visible: boolean;
  /**
   * Pixels to shift the crosshair UP from the geometric center of its
   * containing element. The map canvas extends behind the bottom sheet,
   * drawing-controls bar, and nav — so canvas-center is hidden behind UI.
   * Shifting upward by ~half the bottom-occlusion lands the crosshair in
   * the visual center of what the user actually sees.
   */
  bottomOffsetPx?: number;
}

/**
 * Mobile-only crosshair overlay. The forwarded ref points at the inner dot —
 * the precise pixel the user is aiming at — so map.unproject() can translate
 * its bounding rect into a geographic coordinate that lands EXACTLY under the
 * visual crosshair, independent of any layout offsets.
 */
export const CrosshairOverlay = forwardRef<HTMLDivElement, Props>(
  function CrosshairOverlay({ visible, bottomOffsetPx = 110 }, ref) {
    if (!visible) return null;
    return (
      <div
        className="absolute inset-x-0 pointer-events-none z-20 md:hidden"
        style={{
          top: `calc(50% - ${bottomOffsetPx}px)`,
          transform: 'translateY(-50%)',
        }}
      >
        <div className="relative flex items-center justify-center">
          {/* Outer halo — soft glow for visibility on bright satellite */}
          <div
            className="absolute w-12 h-12 rounded-full"
            style={{
              boxShadow:
                '0 0 0 1px rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.35)',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          />
          {/* Outer ring — 32px white, thick stroke, drop shadow */}
          <div
            className="absolute w-8 h-8 rounded-full border-[3px] border-white"
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
          />
          {/* Inner dot — 10px bright orange */}
          <div
            ref={ref}
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: '#F15A24',
              boxShadow: '0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,0.5)',
            }}
          />
          {/* Crosshair tick marks — high contrast */}
          <div
            className="absolute w-14 h-[2px] rounded"
            style={{
              backgroundColor: '#fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
          <div
            className="absolute h-14 w-[2px] rounded"
            style={{
              backgroundColor: '#fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      </div>
    );
  },
);
