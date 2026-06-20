// GET /api/files?bucket=<job-photos|job-signatures>&path=<object path>
//
// Signed-URL proxy for private job storage. Authorizes the request server-side
// (the only thing the browser sends is its session cookie), then redirects to a
// short-lived signed URL minted with the service role — so this keeps working
// once the buckets are flipped private. Object paths are `<company_id>/<job_id>/
// <file>`; access is granted to staff whose company owns the object. (Portal
// access is a later phase.)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { PROXIED_BUCKETS, type ProxiedBucket } from '@/lib/storage';

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get('bucket') ?? '';
  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!PROXIED_BUCKETS.includes(bucket as ProxiedBucket) || !path) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Object is owned by the company in the first path segment; the requester must
  // belong to it.
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  const companyId = profile?.company_id ?? null;
  if (!companyId || path.split('/')[0] !== companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
