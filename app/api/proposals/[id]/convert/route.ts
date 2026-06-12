import { NextResponse } from 'next/server';
import { localDateStr } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { frequencyToRRule } from '@/lib/rrule-helpers';
import { materializeRecurringJob, defaultMaterializeHorizon } from '@/lib/recurring-jobs';

/**
 * POST /api/proposals/[id]/convert
 *
 * Converts an accepted proposal (estimate) into one or more jobs:
 *   - Reads the proposal + line items
 *   - Inserts a `jobs` row with title, client, status='unscheduled', estimate_id back-pointer
 *   - Snapshots estimate_line_items → job_services (the services spine): name,
 *     quantity, per-unit price (from unit_price), and per-unit on-site duration
 *     (from the catalog service's estimated_duration_minutes). Fully editable
 *     afterward; never live-linked back to the proposal.
 *   - Marks the proposal as status='converted', sets converted_at + converted_by
 *
 * Recurring expansion (RRULE → 26 weekly jobs etc.) is intentionally NOT
 * done in this first cut: we generate one anchor job and let the user
 * apply a recurrence rule on the job detail page (which already exists).
 * That's safer than auto-spawning the wrong number of dates.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  void req;
  const { id } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  const me = profile as { company_id?: string; role?: string } | null;
  if (!me || (me.role !== 'owner' && me.role !== 'dispatcher')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pull proposal + line items, scoped to caller's company.
  const [{ data: proposal, error: pErr }, { data: lineItems, error: lErr }] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, company_id, client_id, title, status, notes')
      .eq('id', id)
      .eq('company_id', me.company_id ?? '')
      .single(),
    supabase
      .from('estimate_line_items')
      .select('*, service:services(estimated_duration_minutes,category)')
      .eq('estimate_id', id)
      .order('sort_order'),
  ]);

  if (pErr || !proposal) {
    return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
  }
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }
  if (proposal.status !== 'accepted') {
    return NextResponse.json(
      { error: 'Only accepted proposals can be converted to jobs.' },
      { status: 400 },
    );
  }

  // Pick the highest-frequency cadence among line items (weekly beats
  // biweekly beats monthly beats one_time). The series RRULE is anchored
  // on the most recurring service; less-frequent services tag along.
  const FREQ_RANK: Record<string, number> = {
    weekly: 5, biweekly: 4, monthly: 3, seasonal: 2, annual: 1, one_time: 0,
  };
  const rawItems = (lineItems ?? []) as Array<{
    service_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    notes?: string | null;
    frequency?: string | null;
    service?: { estimated_duration_minutes?: number | null; category?: string | null } | null;
  }>;
  let topFreq = 'one_time';
  for (const li of rawItems) {
    const f = (li.frequency ?? 'one_time').toLowerCase();
    if ((FREQ_RANK[f] ?? 0) > (FREQ_RANK[topFreq] ?? 0)) topFreq = f;
  }

  // Anchor the series on today (dispatcher can pick a real date on the
  // job detail page; the materializer recomputes from there if changed).
  const today = new Date();
  const todayStr = localDateStr(today);
  const rruleStr = frequencyToRRule(topFreq, today);
  const isRecurring = !!rruleStr;

  // Leave the job-row duration override NULL: the snapshotted job_services
  // durations (× quantity) are the authoritative VROOM source, resolved at
  // optimize-time. That keeps the spine editable — bump a service's duration on
  // the job and the route timing follows, with no stale override on the row.
  const nowIso = new Date().toISOString();
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: proposal.company_id,
      client_id: proposal.client_id,
      title: proposal.title,
      status: isRecurring ? 'scheduled' : 'unscheduled',
      scheduled_date: isRecurring ? todayStr : null,
      estimated_duration_minutes: null,
      notes: proposal.notes ?? null,
      is_recurring: isRecurring,
      recurrence_rule: rruleStr,
      rrule: rruleStr,
      is_recurring_parent: isRecurring,
      estimate_id: proposal.id,
      created_by: user.id,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? 'Failed to create job.' },
      { status: 500 },
    );
  }

  // Snapshot the proposal's line items into the job_services spine. custom_name
  // captures the proposal description; duration_minutes is seeded from the
  // catalog service default (editable afterward); price is the per-unit
  // unit_price (per_month lines already store the monthly rate as unit_price).
  if (rawItems.length > 0) {
    const { error: jsErr } = await supabase.from('job_services').insert(
      rawItems.map((li, i) => ({
        job_id: job.id,
        service_id: li.service_id,
        custom_name: li.description,
        quantity: li.quantity,
        // Non-null always (migration 047): catalog default, else the global
        // 30-minute fallback — never a null that live-links at read time.
        duration_minutes: li.service?.estimated_duration_minutes ?? 30,
        price: li.unit_price,
        notes: li.notes ?? null,
        sort_order: i,
      })),
    );
    if (jsErr) {
      // Best-effort cleanup — drop the orphan job if the spine copy failed.
      await supabase.from('jobs').delete().eq('id', job.id);
      return NextResponse.json({ error: jsErr.message }, { status: 500 });
    }
  }

  // For recurring proposals, expand the parent into 6 months of child
  // occurrences immediately so the schedule populates. Cron extends the
  // horizon thereafter.
  let materializedCount = 0;
  if (isRecurring) {
    try {
      const result = await materializeRecurringJob(
        job.id,
        defaultMaterializeHorizon(),
        supabase,
      );
      materializedCount = result.inserted;
    } catch (err) {
      // Don't roll back — the parent job is fine; the cron will fill in
      // missed occurrences on the next morning's tick.
      // eslint-disable-next-line no-console
      console.warn('Materialize failed at convert time:', (err as Error).message);
    }
  }

  // Mark proposal as converted.
  await supabase
    .from('estimates')
    .update({
      status: 'converted',
      converted_at: nowIso,
      converted_by: user.id,
      updated_at: nowIso,
    })
    .eq('id', proposal.id);

  return NextResponse.json({
    ok: true,
    job_id: job.id,
    is_recurring: isRecurring,
    occurrences_materialized: materializedCount,
  });
}
