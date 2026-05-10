import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      .select('*')
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

  // Create the job. We default to 'unscheduled' so the dispatcher picks
  // dates + crew on the job detail page rather than guessing here.
  const nowIso = new Date().toISOString();
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: proposal.company_id,
      client_id: proposal.client_id,
      title: proposal.title,
      status: 'unscheduled',
      notes: proposal.notes ?? null,
      is_recurring: false,
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

  return NextResponse.json({ ok: true, job_id: job.id });
}
