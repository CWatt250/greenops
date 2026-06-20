/**
 * Helpers for serving storage objects through the signed-URL proxy
 * (`app/api/files`). Stored references come in two shapes: a bare object path
 * (e.g. `job_photos.storage_path`) or a legacy full public URL
 * (`jobs.signature_url`, `job_cost_entries.receipt_url`). Both reduce to the
 * same object path, so we extract the path and route every read through the
 * proxy. That keeps the markup synchronous (`<img src=…>`), works for old and
 * new rows alike, and lets the buckets become private later with no backfill.
 */

/** Buckets the /api/files proxy is allowed to sign. */
export const PROXIED_BUCKETS = ['job-photos', 'job-signatures'] as const;
export type ProxiedBucket = (typeof PROXIED_BUCKETS)[number];

/** Reduce a stored value (bare path or legacy public/sign URL) to the object path. */
export function storageObjectPath(bucket: ProxiedBucket, stored: string): string {
  // Matches .../storage/v1/object/{public|sign|authenticated}/<bucket>/<path>
  const marker = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/`);
  const m = stored.match(marker);
  if (m && m.index != null) {
    const after = stored.slice(m.index + m[0].length);
    return decodeURIComponent(after.split('?')[0]);
  }
  return stored.replace(/^\/+/, '');
}

/** Same-origin proxy URL that redirects to a short-lived signed object URL. */
export function fileSrc(bucket: ProxiedBucket, stored: string | null | undefined): string | null {
  if (!stored) return null;
  const path = storageObjectPath(bucket, stored);
  if (!path) return null;
  return `/api/files?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
}
