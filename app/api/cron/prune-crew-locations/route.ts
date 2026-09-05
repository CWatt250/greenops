import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/**
 * Vercel Cron — daily. The crew app inserts a crew_locations row every 30 s
 * while a job is running (~1,000 rows per worker per day). Dispatch only
 * needs the recent trail; clock-in/out positions live on clock_events and
 * are kept forever with the timesheet. Prune breadcrumbs older than
 * RETENTION_DAYS so the table stays small and the "recent" index stays hot.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 * Server-only: uses SUPABASE_SERVICE_ROLE_KEY (cross-company delete).
 */
const RETENTION_DAYS = 30;

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
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await admin
    .from('crew_locations')
    .delete({ count: 'exact' })
    .lt('recorded_at', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff });
}
