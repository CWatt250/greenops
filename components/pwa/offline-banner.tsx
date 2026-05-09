'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  // Default true so we don't flicker the offline banner during SSR / first
  // hydration on slow connections.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(window.navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[70] rounded-full shadow-lg px-3 py-1.5 flex items-center gap-2 text-xs font-semibold"
      style={{
        backgroundColor: '#1C1C1E',
        color: '#fff',
      }}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-3.5 w-3.5" />
      📴 Offline mode — changes will sync when you reconnect
    </div>
  );
}
