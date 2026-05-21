'use client';

import { forwardRef } from 'react';

interface Props {
  visible: boolean;
}

/**
 * Mobile-only crosshair overlay. The forwarded ref points at the inner dot —
 * the precise pixel the user is aiming at — so map.unproject() can translate
 * its bounding rect into a geographic coordinate that lands EXACTLY under the
 * visual crosshair, independent of any header/banner/safe-area offsets that
 * push the map canvas down inside the viewport.
 */
export const CrosshairOverlay = forwardRef<HTMLDivElement, Props>(
  function CrosshairOverlay({ visible }, ref) {
    if (!visible) return null;
    return (
      <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center md:hidden">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-8 h-8 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
          <div
            ref={ref}
            className="w-2.5 h-2.5 rounded-full shadow-[0_0_0_1.5px_#fff]"
            style={{ backgroundColor: '#F15A24' }}
          />
          <div className="absolute w-12 h-px bg-white/80" />
          <div className="absolute h-12 w-px bg-white/80" />
        </div>
      </div>
    );
  },
);
