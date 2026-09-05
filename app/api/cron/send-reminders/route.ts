import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendSms, smsAllowed, smsConfigured } from '@/lib/sms';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';
import { logOutbound } from '@/lib/outbound-log';
import { dateStrInTz, addDays, formatDayShort, formatClock } from '@/lib/tz';

/**
 * Vercel Cron — daily at 16:00 UTC (9 AM Pacific / noon Eastern, inside
 * quiet hours everywhere in the US). Texts (with consent) or emails each
 * customer with a job scheduled tomorrow in the company's timezone, once
 * per job (jobs.reminder_sent_at). SMS reminders are the single most-cited
 * no-show reducer in the 2026 field-service reviews.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

type JobRow = {
  id: string; title: string | null; scheduled_date: string; scheduled_start: string | null;
  time_window_start: string | null; time_window_end: string | null;
  client: { id: string; name: string; phone: string | null; email: string | null; service_address: string | null; sms_consent: boolean; sms_opt_out_at: string | null } | null;
};

async function run(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && (req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const now = new Date();
  const summary = { companies: 0, sms: 0, email: 0, skipped: 0 };

  const { data: companies } = await admin.from('companies').select('id, name, phone, email, timezone');
  for (const co of (companies ?? []) as Array<{ id: string; name: string; phone: string | null; email: string | null; timezone: string | null }>) {
    summary.companies++;
    const tomorrow = addDays(dateStrInTz(now, co.timezone), 1);
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, title, scheduled_date, scheduled_start, time_window_start, time_window_end, client:clients(id, name, phone, email, service_address, sms_consent, sms_opt_out_at)')
      .eq('company_id', co.id)
      .eq('scheduled_date', tomorrow)
      .eq('status', 'scheduled')
      .is('reminder_sent_at', null)
      .limit(500);
    for (const job of (jobs ?? []) as unknown as JobRow[]) {
      const c = job.client;
      if (!c) continue;
      const { data: portal } = await admin.from('portal_users').select('notification_prefs').eq('client_id', c.id);
      const prefs = (portal ?? []).map((p: { notification_prefs: Record<string, unknown> | null }) => p.notification_prefs);
      const when = formatDayShort(job.scheduled_date);
      const window = job.time_window_start && job.time_window_end
        ? ` between ${formatClock(job.time_window_start)} and ${formatClock(job.time_window_end)}`
        : job.scheduled_start ? ` around ${formatClock(job.scheduled_start)}` : '';
      let sent = false;

      if (smsConfigured() && c.phone && smsAllowed({ sms_consent: c.sms_consent, sms_opt_out_at: c.sms_opt_out_at, portalPrefs: prefs })) {
        const body = `${co.name}: reminder that we're scheduled at ${c.service_address ?? 'your property'} on ${when}${window}. Reply STOP to opt out.`;
        const r = await sendSms({ to: c.phone, body });
        logOutbound(admin, { companyId: co.id, channel: 'sms', recipient: c.phone, template: 'job_reminder', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.sid : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'job', entityId: job.id });
        if (r.ok) { summary.sms++; sent = true; }
      }
      const emailPrefOff = prefs.some((p) => p && p['email_job_reminder'] === false);
      if (!sent && emailConfigured() && c.email && !emailPrefOff) {
        const { html, text } = brandedEmail({
          companyName: co.name,
          heading: `See you ${when}`,
          lines: [
            `Hi ${c.name.split(' ')[0]},`,
            `A quick reminder that ${co.name} is scheduled at ${c.service_address ?? 'your property'} on ${when}${window}.`,
            'Need to reschedule? Reply to this email or send us a note from your portal.',
          ],
          cta: { label: 'Open my portal', url: `${appUrl}/portal` },
        });
        const r = await sendEmail({ to: c.email, subject: `Reminder: ${co.name} on ${when}`, html, text, replyTo: co.email ?? null });
        logOutbound(admin, { companyId: co.id, channel: 'email', recipient: c.email, template: 'job_reminder', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.id : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'job', entityId: job.id });
        if (r.ok) { summary.email++; sent = true; }
      }
      if (!sent) summary.skipped++;
      // Stamp regardless so a customer with no reachable channel isn't retried daily.
      await admin.from('jobs').update({ reminder_sent_at: now.toISOString() }).eq('id', job.id);
    }
  }
  return NextResponse.json({ ok: true, ...summary });
}
