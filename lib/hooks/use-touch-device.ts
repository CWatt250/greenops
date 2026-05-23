'use client';

import { useEffect, useState } from 'react';

// Feature-detects touch input via three signals (any one is enough). This is
// more reliable than viewport-width or `(hover: none)`: iPads in landscape, or
// iPads with an Apple Pencil reporting hover support, slip past both checks
// and get the mouse-driven desktop UI even though their primary input is touch.
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;
      setIsTouch(hasTouch);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  return isTouch;
}
