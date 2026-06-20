// GET /api/files?bucket=<job-photos|job-signatures>&path=<object path>
//
// Signed-URL proxy for private job storage. The browser only sends its session
// cookie; this route authorizes server-side, then redirects to a short-lived
// signed URL minted with the service role — so it keeps working once the
// buckets are flipped private.
//
// Authorization:
//   • Staff (profiles): may read any object owned by their company. Object
//     paths begin with <company_id>.
//   • Portal customers (portal_users): may read ONLY their own job's photos /
//     signature — matched by job ownership, never by company alone, so one
//     customer can't read another's files.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js';
import { PROXIED_BUCKETS, type ProxiedBucket } from '@/lib/storage';

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

async function isAuthorized(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  bucket: ProxiedBucket,
  path: string,
): Promise<boolean> {
  const objectCompany = path.split('/')[0];
  if (!objectCompany) return false;

  // Staff: the object's company is the user's company.
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', userId).maybeSingle();
  if (profile?.company_id && profile.company_id === objectCompany) return true;

  // Portal customer: must own the job the object belongs to.
  const { data: pu } = await supabase
    .from('portal_users').select('company_id, client_id').eq('id', userId).maybeSingle();
  if (!pu?.client_id || pu.company_id !== objectCompany) return false;

  if (bucket === 'job-photos') {
    // Robust to path shape (regular vs issue photos): match the stored row.
    const { data: jp } = await admin
      .from('job_photos').select('job_id').eq('storage_path', path).limit(1).maybeSingle();
    if (!jp?.job_id) return false;
    const { data: job } = await admin
      .from('jobs').select('id').eq('id', jp.job_id).eq('client_id', pu.client_id).maybeSingle();
    return !!job;
  }

  if (bucket === 'job-signatures') {
    // Signature paths are always <company_id>/<job_id>/<file>.
    const jobId = path.split('/')[1];
    if (!jobId) return false;
    const { data: job } = await admin
      .from('jobs').select('id').eq('id', jobId).eq('client_id', pu.client_id).maybeSingle();
    return !!job;
  }

  return false;
}

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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!(await isAuthorized(supabase, admin, user.id, bucket as ProxiedBucket, path))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin.storage
    .from(bucket as ProxiedBucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
