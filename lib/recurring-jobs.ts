import { RRule } from 'rrule';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_HORIZON_MONTHS = 6;

interface ParentRow {
  id: string;
  company_id: string;
  client_id: string | null;
  crew_id: string | null;
  title: string;
  notes: string | null;
  customer_notes: string | null;
  scheduled_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_duration_minutes: number | null;
  rrule: string | null;
  recurrence_rule: string | null;
  materialized_through: string | null;
  recurrence_end_date: string | null;
}

interface JobServiceRow {
  service_id: string | null;
  custom_name: string | null;
  quantity: number | null;
  duration_minutes: number | null;
  price: number | null;
  notes: string | null;
  sort_order: number | null;
}

export interface MaterializeResult {
  parentId: string;
  inserted: number;
  throughDate: string;
}

/**
 * Add `n` months to `d` in UTC, snapping to month-end if the target month
 * is shorter (e.g., Jan 31 + 1mo = Feb 28).
 */
export function addMonthsUTC(d: Date, n: number): Date {
  const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
  // If the day rolled over (Jan 31 + 1mo would land on Mar 3), back up.
  if (result.getUTCDate() !== d.getUTCDate()) {
    result.setUTCDate(0);
  }
  return result;
}

// This module's Dates are UTC-anchored date-only values (fromDateOnly parses
// `T00:00:00Z`, month math uses addMonthsUTC), so the UTC slice round-trips
// exactly on any machine — do NOT convert to localDateStr().
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromDateOnly(s: string | null): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00Z`);
}

/**
 * Expand a recurring parent's RRULE between the last materialized point
 * and `throughDate`, inserting one `jobs` row per occurrence (skipping
 * any that already exist with the same parent + date). Copies the
 * parent's line items onto each new occurrence.
 *
 * Safe to run repeatedly — duplicates are filtered by the (parent_id,
 * scheduled_date) check.
 */
export async function materializeRecurringJob(
  parentJobId: string,
  throughDate: Date,
  supabase: SupabaseClient,
): Promise<MaterializeResult> {
  const { data: parentRaw, error: pErr } = await supabase
    .from('jobs')
    .select(
      'id, company_id, client_id, crew_id, title, notes, customer_notes, ' +
      'scheduled_date, scheduled_start, scheduled_end, estimated_duration_minutes, ' +
      'rrule, recurrence_rule, materialized_through, recurrence_end_date',
    )
    .eq('id', parentJobId)
    .single();

  if (pErr || !parentRaw) {
    throw new Error(pErr?.message ?? 'Parent recurring job not found');
  }
  const parent = (parentRaw as unknown) as ParentRow;

  const ruleStr = parent.rrule ?? parent.recurrence_rule;
  if (!ruleStr) {
    throw new Error('Parent has no recurrence rule');
  }
  const seedDate = fromDateOnly(parent.scheduled_date);
  if (!seedDate) {
    throw new Error('Parent has no anchor scheduled_date');
  }

  // Walk forward from where we left off, never before the parent's anchor.
  const lastMaterialized = fromDateOnly(parent.materialized_through);
  let walkStart = lastMaterialized && lastMaterialized > seedDate
    ? new Date(lastMaterialized.getTime() + 86_400_000) // day after last
    : seedDate;

  // Honor an explicit series end.
  const seriesEnd = fromDateOnly(parent.recurrence_end_date);
  let walkEnd = throughDate;
  if (seriesEnd && walkEnd > seriesEnd) walkEnd = seriesEnd;

  if (walkStart >= walkEnd) {
    return { parentId: parent.id, inserted: 0, throughDate: toDateOnly(throughDate) };
  }

  // Parse the RRULE. The library expects DTSTART encoded into the rule
  // for absolute occurrences; we set dtstart explicitly to the anchor.
  const ruleNoPrefix = ruleStr.replace(/^RRULE:/, '');
  let rule: RRule;
  try {
    rule = new RRule({
      ...RRule.parseString(ruleNoPrefix),
      dtstart: new Date(Date.UTC(seedDate.getUTCFullYear(), seedDate.getUTCMonth(), seedDate.getUTCDate())),
    });
  } catch (err) {
    throw new Error(`Invalid RRULE on parent ${parent.id}: ${(err as Error).message}`);
  }

  const occurrences = rule.between(walkStart, walkEnd, true);

  // Cross-reference what we already have so re-runs are idempotent.
  const { data: existing } = await supabase
    .from('jobs')
    .select('scheduled_date')
    .eq('recurring_parent_id', parent.id);
  const existingDates = new Set(
    ((existing ?? []) as Array<{ scheduled_date: string | null }>)
      .map((r) => r.scheduled_date)
      .filter((d): d is string => !!d),
  );

  const newDates = occurrences
    .map((o) => toDateOnly(o))
    .filter((d) => !existingDates.has(d));

  if (newDates.length === 0) {
    await supabase
      .from('jobs')
      .update({ materialized_through: toDateOnly(throughDate) })
      .eq('id', parent.id);
    return { parentId: parent.id, inserted: 0, throughDate: toDateOnly(throughDate) };
  }

  // Pull the parent's services spine once; copy onto every new occurrence.
  const { data: itemsRaw } = await supabase
    .from('job_services')
    .select('service_id, custom_name, quantity, duration_minutes, price, notes, sort_order')
    .eq('job_id', parent.id);
  const items = (itemsRaw ?? []) as JobServiceRow[];

  // Insert occurrences in one round-trip.
  const occurrenceRows = newDates.map((dateStr) => ({
    company_id: parent.company_id,
    client_id: parent.client_id,
    crew_id: parent.crew_id,
    title: parent.title,
    status: 'scheduled' as const,
    scheduled_date: dateStr,
    scheduled_start: parent.scheduled_start,
    scheduled_end: parent.scheduled_end,
    estimated_duration_minutes: parent.estimated_duration_minutes,
    notes: parent.notes,
    customer_notes: parent.customer_notes,
    is_recurring: true,
    recurrence_rule: parent.recurrence_rule ?? parent.rrule,
    recurring_parent_id: parent.id,
    is_recurring_parent: false,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('jobs')
    .insert(occurrenceRows)
    .select('id, scheduled_date');

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message ?? 'Failed to insert occurrences');
  }

  // Copy the services spine onto each new occurrence row.
  if (items.length > 0) {
    const serviceRows: Array<Record<string, unknown>> = [];
    for (const occ of inserted as Array<{ id: string }>) {
      for (const js of items) {
        serviceRows.push({
          job_id: occ.id,
          service_id: js.service_id,
          custom_name: js.custom_name,
          quantity: js.quantity ?? 1,
          // Pre-047 parents may still carry null — never copy it forward.
          duration_minutes: js.duration_minutes ?? 30,
          price: js.price ?? 0,
          notes: js.notes,
          sort_order: js.sort_order ?? 0,
        });
      }
    }
    if (serviceRows.length > 0) {
      const { error: jsErr } = await supabase.from('job_services').insert(serviceRows);
      if (jsErr) {
        // Best-effort cleanup so we don't leave childless service rows.
        const newIds = (inserted as Array<{ id: string }>).map((r) => r.id);
        await supabase.from('jobs').delete().in('id', newIds);
        throw new Error(`Service copy failed: ${jsErr.message}`);
      }
    }
  }

  await supabase
    .from('jobs')
    .update({ materialized_through: toDateOnly(throughDate) })
    .eq('id', parent.id);

  return {
    parentId: parent.id,
    inserted: newDates.length,
    throughDate: toDateOnly(throughDate),
  };
}

/** Default 6-month horizon used by the form on first save. */
export function defaultMaterializeHorizon(from: Date = new Date()): Date {
  return addMonthsUTC(from, DEFAULT_HORIZON_MONTHS);
}
