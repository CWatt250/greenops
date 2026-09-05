import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendSms, smsAllowed, smsConfigured } from '@/lib/sms';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';
import { logOutbound } from '@/lib/outbound-log';
import { hourInTz } from '@/lib/tz';

/**
 * Vercel Cron — hourly. For every job completed in the last 48 hours whose
 * company has a review link (Settings → Customer communication), ask the
 * customer for a review once (jobs.review_requested_at). Sends land at
 * least ~20 minutes after completion and only between 8 AM and 8 PM in the
 * company's timezone.
 */
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

type JobRow = {
  id: string; actual_end: string | null; updated_at: string | null;
  client: { id: string; name: string; phone: string | null; email: string | null; sms_consent: boolean; sms_opt_out_at: string | null } | null;
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
  const now = new Date();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const minAge = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const summary = { companies: 0, sms: 0, email: 0, skipped: 0, quiet: 0 };

  const { data: companies } = await admin
    .from('companies').select('id, name, email, timezone, review_url').not('review_url', 'is', null);
  for (const co of (companies ?? []) as Array<{ id: string; name: string; email: string | null; timezone: string | null; review_url: string }>) {
    summary.companies++;
    const hour = hourInTz(now, co.timezone);
    if (hour < 8 || hour >= 20) { summary.quiet++; continue; }
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, actual_end, updated_at, client:clients(id, name, phone, email, sms_consent, sms_opt_out_at)')
      .eq('company_id', co.id)
      .eq('status', 'complete')
      .is('review_requested_at', null)
      .gte('actual_end', since)
      .lte('actual_end', minAge)
      .limit(200);
    for (const job of (jobs ?? []) as unknown as JobRow[]) {
      const c = job.client;
      if (!c) continue;
      const { data: portal } = await admin.from('portal_users').select('notification_prefs').eq('client_id', c.id);
      const prefs = (portal ?? []).map((p: { notification_prefs: Record<string, unknown> | null }) => p.notification_prefs);
      if (prefs.some((p) => p && p['email_review_request'] === false)) {
        await admin.from('jobs').update({ review_requested_at: now.toISOString() }).eq('id', job.id);
        summary.skipped++;
        continue;
      }
      const first = c.name.split(' ')[0];
      let sent = false;
      if (emailConfigured() && c.email) {
        const { html, text } = brandedEmail({
          companyName: co.name,
          heading: `How did we do, ${first}?`,
          lines: [
            `Thanks for having ${co.name} out today. If everything looked great, a quick review helps our crew more than you'd think.`,
            'If something wasn’t right, reply to this email and we’ll make it right first.',
          ],
          cta: { label: 'Leave a review', url: co.review_url },
        });
        const r = await sendEmail({ to: c.email, subject: `How did we do, ${first}?`, html, text, replyTo: co.email ?? null });
        logOutbound(admin, { companyId: co.id, channel: 'email', recipient: c.email, template: 'review_request', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.id : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'job', entityId: job.id });
        if (r.ok) { summary.email++; sent = true; }
      }
      if (!sent && smsConfigured() && c.phone && smsAllowed({ sms_consent: c.sms_consent, sms_opt_out_at: c.sms_opt_out_at, portalPrefs: prefs })) {
        const r = await sendSms({ to: c.phone, body: `${co.name}: thanks for having us out! A quick review helps our crew: ${co.review_url} Reply STOP to opt out.` });
        logOutbound(admin, { companyId: co.id, channel: 'sms', recipient: c.phone, template: 'review_request', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.sid : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'job', entityId: job.id });
        if (r.ok) { summary.sms++; sent = true; }
      }
      if (!sent) summary.skipped++;
      await admin.from('jobs').update({ review_requested_at: now.toISOString() }).eq('id', job.id);
    }
  }
  return NextResponse.json({ ok: true, ...summary });
}
