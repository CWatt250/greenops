import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { frequencyToRRule } from '@/lib/rrule-helpers';
import { materializeRecurringJob, defaultMaterializeHorizon } from '@/lib/recurring-jobs';

/**
 * POST /api/proposals/[id]/convert
 *
 * Converts an accepted proposal (estimate) into one or more jobs:
 *   - Reads the proposal + line items
 *   - Inserts a `jobs` row with title, client, status='unscheduled', estimate_id back-pointer
 *   - Copies estimate_line_items → job_line_items 1:1 (price + quantity)
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
  const todayStr = today.toISOString().slice(0, 10);
  const rruleStr = frequencyToRRule(topFreq, today);
  const isRecurring = !!rruleStr;

  // Sum line-item service durations so the job carries a real time estimate
  // through to VROOM. Falls back to null when no line item maps to a service
  // with a duration — lib/vroom.ts will still pick up the category default.
  const summedDuration = rawItems.reduce((sum, li) => {
    const d = li.service?.estimated_duration_minutes;
    return typeof d === 'number' && d > 0 ? sum + d : sum;
  }, 0);
  const estimatedDurationMinutes = summedDuration > 0 ? summedDuration : null;

  // Create the job (or recurring parent). For recurring proposals we
  // schedule the anchor to today so materializeRecurringJob has a seed;
  // dispatcher can drag it to a real start date afterward.
  const nowIso = new Date().toISOString();
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: proposal.company_id,
      client_id: proposal.client_id,
      title: proposal.title,
      status: isRecurring ? 'scheduled' : 'unscheduled',
      scheduled_date: isRecurring ? todayStr : null,
      estimated_duration_minutes: estimatedDurationMinutes,
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

  // Copy line items into job_line_items.
  const items = (lineItems ?? []) as Array<{
    service_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  if (items.length > 0) {
    const { error: liErr } = await supabase.from('job_line_items').insert(
      items.map((li) => ({
        job_id: job.id,
        service_id: li.service_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.total,
      })),
    );
    if (liErr) {
      // Best-effort cleanup — drop the orphan job if line items failed.
      await supabase.from('jobs').delete().eq('id', job.id);
      return NextResponse.json({ error: liErr.message }, { status: 500 });
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
