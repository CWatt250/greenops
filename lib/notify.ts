import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The one place notifications are produced (roadmap F0.2). Every producer
 * goes through here so future delivery channels (email, SMS, push) can be
 * added once instead of at 13 call sites. Today the only channel is the
 * in-app tables (`notifications` for staff, `portal_notifications` for
 * customers); the email hook lands with F0.1 when a provider exists.
 *
 * Both functions are safe to fire-and-forget (`void notifyStaff(...)`) —
 * they never throw; failures return { delivered: 0 }.
 */

export type StaffRole = 'owner' | 'dispatcher' | 'crew';

export interface StaffNotice {
  companyId: string;
  title: string;
  body?: string | null;
  entityType?: string;
  entityId?: string;
  /** Defaults to the office (owner + dispatcher). */
  roles?: StaffRole[];
  /** Skip one profile (e.g. the actor themselves). */
  excludeProfileId?: string;
}

export type PortalNoticeType =
  | 'job_scheduled' | 'crew_enroute' | 'job_complete'
  | 'invoice_ready' | 'request_update' | 'complaint_update' | 'message';

export interface CustomerNotice {
  /** Direct target; when omitted, clientId resolves every portal user on the account. */
  portalUserId?: string;
  clientId?: string;
  type: PortalNoticeType;
  title: string;
  body?: string | null;
  entityType?: string;
  entityId?: string;
}

export async function notifyStaff(
  supabase: SupabaseClient,
  n: StaffNotice,
): Promise<{ delivered: number }> {
  try {
    const { data: staff } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', n.companyId)
      .in('role', n.roles ?? ['owner', 'dispatcher']);
    const targets = (staff ?? [])
      .map((s: { id: string }) => s.id)
      .filter((id) => id !== n.excludeProfileId);
    if (targets.length === 0) return { delivered: 0 };
    const { error } = await supabase.from('notifications').insert(
      targets.map((profileId) => ({
        company_id: n.companyId,
        profile_id: profileId,
        title: n.title,
        body: n.body ?? null,
        entity_type: n.entityType ?? null,
        entity_id: n.entityId ?? null,
      })),
    );
    return { delivered: error ? 0 : targets.length };
  } catch {
    return { delivered: 0 };
  }
}

export async function notifyCustomer(
  supabase: SupabaseClient,
  n: CustomerNotice,
): Promise<{ delivered: number }> {
  try {
    let targets: string[] = [];
    if (n.portalUserId) {
      targets = [n.portalUserId];
    } else if (n.clientId) {
      const { data } = await supabase
        .from('portal_users')
        .select('id')
        .eq('client_id', n.clientId);
      targets = (data ?? []).map((u: { id: string }) => u.id);
    }
    if (targets.length === 0) return { delivered: 0 };
    void emailCustomers(supabase, n, targets);
    const { error } = await supabase.from('portal_notifications').insert(
      targets.map((portalUserId) => ({
        portal_user_id: portalUserId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        entity_type: n.entityType ?? null,
        entity_id: n.entityId ?? null,
      })),
    );
    return { delivered: error ? 0 : targets.length };
  } catch {
    return { delivered: 0 };
  }
}

/**
 * Email leg of a customer notice. Server-only (the sender needs the provider
 * key); in the browser this is a no-op and only the in-app row is written.
 * Honors portal_users.notification_prefs: a customer who turned "Invoice
 * Ready" emails off gets the bell, not the email. Best-effort, never throws.
 */
const PREF_FOR_TYPE: Partial<Record<PortalNoticeType, string>> = {
  job_scheduled: 'email_job_reminder',
  invoice_ready: 'email_invoice',
  request_update: 'email_request_update',
  complaint_update: 'email_request_update',
};

async function emailCustomers(supabase: SupabaseClient, n: CustomerNotice, portalUserIds: string[]) {
  if (typeof window !== 'undefined') return;
  const prefKey = PREF_FOR_TYPE[n.type];
  if (!prefKey || !process.env.RESEND_API_KEY) return;
  try {
    const { sendEmail, brandedEmail } = await import('@/lib/email');
    const { data: users } = await supabase
      .from('portal_users')
      .select('id, client_id, company_id, notification_prefs, client:clients(name, email), company:companies(name, email)')
      .in('id', portalUserIds);
    for (const u of (users ?? []) as Array<{
      notification_prefs: Record<string, boolean> | null;
      client: { name?: string; email?: string | null } | null;
      company: { name?: string; email?: string | null } | null;
    }>) {
      if (u.notification_prefs && u.notification_prefs[prefKey] === false) continue;
      const to = u.client?.email;
      if (!to) continue;
      const companyName = u.company?.name ?? 'Your landscaper';
      const { html, text } = brandedEmail({
        companyName,
        heading: n.title,
        lines: [
          `Hi ${u.client?.name?.split(' ')[0] ?? 'there'},`,
          ...(n.body ? [n.body] : []),
          'Open your customer portal for the details.',
        ],
        cta: { label: 'Open my portal', url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://greenops-rho.vercel.app'}/portal` },
      });
      await sendEmail({ to, subject: n.title, html, text, replyTo: u.company?.email ?? null });
    }
  } catch {
    /* best-effort */
  }
}
