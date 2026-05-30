import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/**
 * Vercel Cron — runs daily at 09:00 UTC. Issues one trivial query against
 * Supabase so the free-tier project registers activity and never auto-pauses
 * (Supabase free projects pause after ~7 days of inactivity, which causes a
 * cold-start stall on the next request — a major source of "slow login").
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 * Server-only: uses SUPABASE_SERVICE_ROLE_KEY so the ping is independent of RLS.
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

  // Cheapest possible touch: a HEAD count against a tiny table.
  const { error, count } = await admin
    .from('companies')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pinged: true, companies: count ?? 0 });
}
