'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, X } from 'lucide-react';
import { toast } from 'sonner';

const DISMISS_KEY = 'tlc-push-dismissed';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * "Turn on alerts" card for installed PWAs. Subscribes this device to web
 * push so dispatches and announcements arrive with the app closed. Renders
 * nothing when push isn't supported, keys aren't configured, the user
 * already subscribed, or they dismissed it.
 */
export function PushPrompt({ variant = 'card' }: { variant?: 'card' | 'row' }) {
  const [state, setState] = useState<'hidden' | 'prompt' | 'enabled' | 'busy'>('hidden');
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!publicKey || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    let cancelled = false;
    (async () => {
      if (Notification.permission === 'denied') return;
      let subscribed = false;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        subscribed = !!(await reg?.pushManager.getSubscription());
      } catch {
        // Some browsers reject getSubscription() until the user gestures; treat
        // that as "not subscribed" so the prompt still offers to enable.
      }
      if (cancelled) return;
      if (subscribed) { setState('enabled'); return; }
      try { if (variant === 'card' && localStorage.getItem(DISMISS_KEY)) return; } catch { /* fine */ }
      setState('prompt');
    })();
    return () => { cancelled = true; };
  }, [publicKey, variant]);

  async function enable() {
    if (!publicKey) return;
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast.message('Alerts stay off. You can enable them in your browser settings later.'); setState('hidden'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error('Could not save the subscription');
      setState('enabled');
      toast.success('Alerts on for this device.');
    } catch (err) {
      toast.error((err as Error).message);
      setState('prompt');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('prompt');
      toast.success('Alerts off for this device.');
    } catch (err) {
      toast.error((err as Error).message);
      setState('enabled');
    }
  }

  if (state === 'hidden') return null;

  if (variant === 'row') {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <p className="font-medium">Alerts on this device</p>
          <p className="text-xs text-muted-foreground">Dispatches and announcements arrive even when the app is closed.</p>
        </div>
        {state === 'enabled' ? (
          <Button type="button" size="sm" variant="outline" onClick={disable}><BellOff className="mr-1.5 h-3.5 w-3.5" /> Turn off</Button>
        ) : (
          <Button type="button" size="sm" onClick={enable} disabled={state === 'busy'}><Bell className="mr-1.5 h-3.5 w-3.5" /> Turn on</Button>
        )}
      </div>
    );
  }

  if (state === 'enabled') return null;
  return (
    <div className="relative rounded-2xl border bg-card p-4 pr-10 shadow-sm">
      <button type="button" aria-label="Not now" onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* fine */ } setState('hidden'); }} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}>
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Get dispatch alerts on this phone</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Know the moment a route is sent or the office posts an announcement, even with the app closed.</p>
          <Button type="button" size="sm" className="mt-3 h-10 text-white" style={{ backgroundColor: 'var(--orange)' }} onClick={enable} disabled={state === 'busy'}>
            Turn on alerts
          </Button>
        </div>
      </div>
    </div>
  );
}
