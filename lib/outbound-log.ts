import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * One row per email/SMS the app sends (or deliberately skips), so the
 * office can answer "did the reminder go out?" from Settings instead of
 * guessing. Fire-and-forget; never throws.
 */
export interface OutboundLogInput {
  companyId: string | null;
  channel: 'email' | 'sms';
  recipient: string;
  template: string;
  status: 'sent' | 'failed' | 'skipped';
  providerId?: string | null;
  error?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export function logOutbound(admin: SupabaseClient, m: OutboundLogInput): void {
  try {
    void admin
      .from('outbound_messages')
      .insert({
        company_id: m.companyId,
        channel: m.channel,
        recipient: m.recipient,
        template: m.template,
        status: m.status,
        provider_id: m.providerId ?? null,
        error: m.error ?? null,
        entity_type: m.entityType ?? null,
        entity_id: m.entityId ?? null,
      })
      .then(() => {});
  } catch {
    /* never throw */
  }
}
