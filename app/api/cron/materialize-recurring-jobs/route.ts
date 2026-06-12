import { NextResponse } from 'next/server';
import { localDateStr } from '@/lib/dates';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  materializeRecurringJob,
  defaultMaterializeHorizon,
  addMonthsUTC,
} from '@/lib/recurring-jobs';

/**
 * Vercel Cron — runs daily at 07:00 UTC (after the recurring-invoice
 * cron). Walks every recurring parent job and extends its horizon to
 * 6 months out so the schedule view always has the next half-year of
 * occurrences materialized.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 * Server-only: requires SUPABASE_SERVICE_ROLE_KEY to insert across
 * companies.
 */

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

async function run(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: parents, error } = await admin
    .from('jobs')
    .select('id, materialized_through, recurrence_end_date')
    .eq('is_recurring_parent', true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const horizon = defaultMaterializeHorizon();
  const horizonStr = localDateStr(horizon);

  const results: Array<{ id: string; inserted?: number; error?: string }> = [];
  let totalInserted = 0;

  for (const p of (parents ?? []) as Array<{
    id: string;
    materialized_through: string | null;
    recurrence_end_date: string | null;
  }>) {
    // Skip parents that have already passed their explicit end date AND
    // are fully materialized through it.
    if (p.recurrence_end_date && p.recurrence_end_date < localDateStr()) {
      continue;
    }
    // If we've already materialized past the horizon, nothing to do.
    if (p.materialized_through && p.materialized_through >= horizonStr) {
      continue;
    }
    try {
      const target = p.recurrence_end_date && p.recurrence_end_date < horizonStr
        ? new Date(`${p.recurrence_end_date}T00:00:00Z`)
        : addMonthsUTC(new Date(), 6);
      const r = await materializeRecurringJob(p.id, target, admin);
      results.push({ id: p.id, inserted: r.inserted });
      totalInserted += r.inserted;
    } catch (err) {
      results.push({ id: p.id, error: (err as Error).message ?? 'failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    parents_checked: (parents ?? []).length,
    occurrences_inserted: totalInserted,
    results,
  });
}
