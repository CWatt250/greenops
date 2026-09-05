import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Web push to installed PWAs (crew phones, office desktops). Server-only.
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * for the browser to subscribe). Without them every call is a no-op.
 * Dead endpoints (404/410) are deleted as they are discovered.
 */
export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string | null;
}

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushToProfiles(
  admin: SupabaseClient,
  profileIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured() || profileIds.length === 0) return { sent: 0, failed: 0 };
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:support@watt-systems.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', profileIds);
  let sent = 0, failed = 0;
  const dead: string[] = [];
  const body = JSON.stringify({ title: payload.title, body: payload.body ?? '', url: payload.url ?? '/', tag: payload.tag ?? undefined });
  await Promise.all(((subs ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 });
      sent++;
    } catch (err) {
      failed++;
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }));
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  if (sent) await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('profile_id', profileIds);
  return { sent, failed };
}
