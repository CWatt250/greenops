import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ORS_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization';

export async function POST(req: Request) {
  // Require a signed-in user. This endpoint forwards to OpenRouteService using
  // the server's API key, so leaving it open would let anyone drain our routing
  // credits. The only caller is the (authenticated) route builder.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'ORS_API_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await fetch(ORS_OPTIMIZATION_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message ?? 'Network error reaching ORS.' },
      { status: 502 },
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error body — fall through with status only.
  }

  if (!res.ok) {
    const errMsg =
      (data as { error?: string | { message?: string } } | null)?.error;
    const msg =
      typeof errMsg === 'string'
        ? errMsg
        : errMsg && typeof errMsg === 'object' && 'message' in errMsg
          ? errMsg.message
          : `ORS HTTP ${res.status}`;
    return NextResponse.json(
      { ok: false, error: msg, status: res.status },
      { status: res.status },
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
