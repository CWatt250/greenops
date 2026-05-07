'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface WeatherBannerProps {
  summary: string;
  routeId?: string;
}

export function WeatherBanner({ summary, routeId }: WeatherBannerProps) {
  const storageKey = routeId ? `weather_dismissed_${routeId}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === '1';
  });

  function dismiss() {
    if (storageKey) localStorage.setItem(storageKey, '1');
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-white shrink-0"
      style={{ backgroundColor: '#F59E0B' }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium capitalize">
          ⚠️ {summary} forecast — consider rescheduling
        </p>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded-full p-0.5 hover:bg-white/20 transition-colors"
        aria-label="Dismiss weather warning"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
