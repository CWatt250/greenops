// POST /api/jobs/:id/en-route
// Called from the crew app when a worker taps "Get Directions" on the active
// stop. Flips jobs.status → 'en_route', computes an ETA via Mapbox Directions
// from the crew's current GPS coords (or the previous stop / company depot)
// to the destination, writes jobs.eta_minutes + jobs.en_route_at, and queues
// a dispatch notification so Trent sees the crew start to move in real time.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDriveLeg } from '@/lib/mapbox-directions';
import { notifyStaff } from '@/lib/notify';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendSms, smsAllowed, smsConfigured } from '@/lib/sms';
import { logOutbound } from '@/lib/outbound-log';

interface EnRouteBody {
  origin_lat?: number | null;
  origin_lng?: number | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: EnRouteBody = {};
  try {
    body = (await req.json()) as EnRouteBody;
  } catch {
    // Body is optional — without coords we just skip ETA.
  }

  // Fetch the job + its client coords. RLS scopes by company.
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select(`
      id, company_id, status, title,
      client:clients(id, name, service_address, latitude, longitude)
    `)
    .eq('id', id)
    .single() as { data: {
      id: string;
      company_id: string;
      status: string;
      title: string | null;
      client: { id: string; name: string; service_address: string | null; latitude: number | null; longitude: number | null } | null;
    } | null; error: { message: string } | null };

  if (jobErr || !job) {
    return NextResponse.json({ ok: false, error: jobErr?.message ?? 'Job not found' }, { status: 404 });
  }

  // Compute ETA only when we have both endpoints. Origin priority:
  // 1) Worker's live GPS (passed in body), 2) company depot.
  const destLat = job.client?.latitude;
  const destLng = job.client?.longitude;
  let etaMinutes: number | null = null;

  if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
    let originLng: number | null = null;
    let originLat: number | null = null;
    if (Number.isFinite(body.origin_lng) && Number.isFinite(body.origin_lat)) {
      originLng = Number(body.origin_lng);
      originLat = Number(body.origin_lat);
    } else {
      const { data: company } = await supabase
        .from('companies')
        .select('depot_latitude, depot_longitude')
        .eq('id', job.company_id)
        .single();
      if (Number.isFinite(company?.depot_longitude) && Number.isFinite(company?.depot_latitude)) {
        originLng = Number(company!.depot_longitude);
        originLat = Number(company!.depot_latitude);
      }
    }

    if (originLng !== null && originLat !== null) {
      const leg = await getDriveLeg([originLng, originLat], [Number(destLng), Number(destLat)]);
      if (leg) etaMinutes = leg.duration_minutes;
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('jobs')
    .update({
      status: 'en_route',
      eta_minutes: etaMinutes,
      en_route_at: nowIso,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  // Best-effort side effects — never block the response.
  // supabase-js builders are lazy — .then() forces the fire-and-forget
  // to actually execute (a bare `void builder` never sends the request).
  void supabase.from('activity_log').insert({
    company_id: job.company_id,
    entity_type: 'job',
    entity_id: id,
    action: 'en_route',
    actor_id: user.id,
    metadata: { eta_minutes: etaMinutes },
  }).then(() => {});

  const etaSuffix = etaMinutes ? ` — ETA ${etaMinutes} min` : '';
  void notifyStaff(supabase, {
    companyId: job.company_id,
    title: `Crew en route to ${job.client?.name ?? 'job'}${etaSuffix}`,
    body: job.client?.service_address ?? null,
    entityType: 'job',
    entityId: id,
  });

  // Customer "on my way" text — only with recorded consent (client flag or
  // portal toggle) and never after a STOP. Best-effort, never blocks.
  void textCustomerEnRoute(job.company_id, job.client?.id ?? null, etaMinutes, id);

  return NextResponse.json({ ok: true, eta_minutes: etaMinutes });
}

async function textCustomerEnRoute(companyId: string, clientId: string | null, etaMinutes: number | null, jobId: string) {
  try {
    if (!clientId || !smsConfigured()) return;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const [{ data: client }, { data: portal }, { data: company }] = await Promise.all([
      admin.from('clients').select('phone, service_address, sms_consent, sms_opt_out_at').eq('id', clientId).single(),
      admin.from('portal_users').select('notification_prefs').eq('client_id', clientId),
      admin.from('companies').select('name').eq('id', companyId).single(),
    ]);
    if (!client?.phone) return;
    const prefs = (portal ?? []).map((p: { notification_prefs: Record<string, unknown> | null }) => p.notification_prefs);
    if (!smsAllowed({ sms_consent: client.sms_consent, sms_opt_out_at: client.sms_opt_out_at, portalPrefs: prefs })) return;
    const eta = etaMinutes ? `, about ${etaMinutes} min away` : '';
    const body = `${company?.name ?? 'Our crew'}: we're on the way to ${client.service_address ?? 'your property'}${eta}. Reply STOP to opt out.`;
    const r = await sendSms({ to: client.phone, body });
    logOutbound(admin, { companyId, channel: 'sms', recipient: client.phone, template: 'crew_enroute', status: r.ok ? 'sent' : 'failed', providerId: r.ok ? r.sid : null, error: r.ok ? null : ('error' in r ? r.error : r.skipped), entityType: 'job', entityId: jobId });
  } catch {
    /* best-effort */
  }
}
