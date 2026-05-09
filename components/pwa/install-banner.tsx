'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Share, Plus, X } from 'lucide-react';

const DISMISS_KEY = 'tlc.pwa.install-dismissed-at';
// Re-show the banner after 14 days even if the user dismissed it once.
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari iOS quirk
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(window.navigator.userAgent);
}

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState<'ios' | 'android'>('ios');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobile()) return;
    if (recentlyDismissed()) return;

    setVariant(isIOS() ? 'ios' : 'android');
    setVisible(true);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function handleAndroidInstall() {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted') dismiss();
    } catch {
      // Swallow — user can still pinch the menu themselves.
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-2 bottom-2 z-[60] rounded-xl shadow-lg border px-3 py-2.5 flex items-start gap-3 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm"
      style={{
        backgroundColor: 'var(--orange-soft)',
        borderColor: 'var(--orange)',
        color: 'var(--orange-deep)',
      }}
      role="dialog"
      aria-label="Install app"
    >
      <Smartphone className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-xs leading-relaxed">
        <p className="font-bold">📲 Install TLC app</p>
        {variant === 'ios' ? (
          <p>
            Tap{' '}
            <span className="inline-flex items-center align-middle gap-0.5 font-semibold">
              <Share className="inline h-3 w-3" /> Share
            </span>{' '}
            then{' '}
            <span className="inline-flex items-center align-middle gap-0.5 font-semibold">
              <Plus className="inline h-3 w-3" /> Add to Home Screen
            </span>{' '}
            so it opens like a native app.
          </p>
        ) : installEvent ? (
          <>
            <p>Add TLC to your home screen for one-tap access.</p>
            <button
              type="button"
              onClick={handleAndroidInstall}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-white"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              <Plus className="h-3 w-3" /> Install
            </button>
          </>
        ) : (
          <p>Open your browser menu and choose <strong>Add to Home Screen</strong>.</p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 mt-0.5 hover:opacity-70"
        aria-label="Dismiss install banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
