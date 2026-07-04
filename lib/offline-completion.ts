'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Offline job-completion queue. Unlike lib/offline-queue.ts (small JSON
 * mutations in localStorage), completions carry photo/signature Blobs, so
 * they live in IndexedDB. One record per job (keyPath jobId) — a resubmit
 * overwrites the previous draft instead of double-queueing.
 *
 * Replay is idempotent end to end:
 *  - media uploads use deterministic object paths + upsert, so a retry
 *    after a half-failed sync overwrites the same objects;
 *  - the complete_job RPC (migrations 035/046) is atomic and rejects an
 *    already-complete job with a known message, which we treat as success.
 */

const DB_NAME = 'tlc-offline';
const DB_VERSION = 1;
const STORE = 'completions';

export interface QueuedPhoto {
  id: string;
  blob: Blob;
  contentType: string;
  ext: string;
  isAfter: boolean;
}

export interface QueuedCompletion {
  jobId: string;
  companyId: string;
  userId: string;
  /** Display fields so the sync banner can name the job while offline. */
  jobTitle: string;
  clientName: string | null;
  notes: string;
  signerName: string;
  signatureBlob: Blob | null;
  photos: QueuedPhoto[];
  lat: number | null;
  lng: number | null;
  queuedAt: number;
  /** Set when a sync attempt was rejected (e.g. job cancelled). */
  lastError?: string;
}

export interface SyncResult {
  synced: Array<{ jobId: string; jobTitle: string }>;
  failed: Array<{ jobId: string; jobTitle: string; error: string }>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'jobId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveCompletion(record: QueuedCompletion): Promise<void> {
  await tx('readwrite', (s) => s.put(record));
  notifyListeners();
}

export function getCompletion(jobId: string): Promise<QueuedCompletion | undefined> {
  return tx('readonly', (s) => s.get(jobId) as IDBRequest<QueuedCompletion | undefined>);
}

export function listCompletions(): Promise<QueuedCompletion[]> {
  return tx('readonly', (s) => s.getAll() as IDBRequest<QueuedCompletion[]>);
}

export async function removeCompletion(jobId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(jobId));
  notifyListeners();
}

export async function queuedCompletionCount(): Promise<number> {
  try {
    return await tx('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

// ── Change notification (same-tab; IDB has no storage event) ────────────────

const LISTENER_EVENT = 'tlc-offline-completions-changed';

export function onCompletionsChanged(cb: () => void): () => void {
  window.addEventListener(LISTENER_EVENT, cb);
  return () => window.removeEventListener(LISTENER_EVENT, cb);
}

function notifyListeners() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LISTENER_EVENT));
  }
}

// ── Sync ────────────────────────────────────────────────────────────────────

let syncing = false;

/**
 * Replay every queued completion. Safe to call repeatedly (re-entrancy
 * guarded); call on `online` and on crew-page mount.
 */
export async function syncCompletions(supabase: SupabaseClient): Promise<SyncResult> {
  const result: SyncResult = { synced: [], failed: [] };
  if (syncing || typeof indexedDB === 'undefined') return result;
  syncing = true;
  try {
    const records = await listCompletions();
    for (const r of records) {
      try {
        await replayOne(supabase, r);
        await removeCompletion(r.jobId);
        result.synced.push({ jobId: r.jobId, jobTitle: r.jobTitle });
      } catch (err) {
        const msg = (err as Error).message ?? 'Sync failed';
        // The 046 guard means someone (or a previous half-finished replay)
        // already completed it — the work is recorded, drop the queue item.
        if (/already complete/i.test(msg)) {
          await removeCompletion(r.jobId);
          result.synced.push({ jobId: r.jobId, jobTitle: r.jobTitle });
          continue;
        }
        await saveCompletion({ ...r, lastError: msg });
        result.failed.push({ jobId: r.jobId, jobTitle: r.jobTitle, error: msg });
      }
    }
  } finally {
    syncing = false;
  }
  return result;
}

async function replayOne(supabase: SupabaseClient, r: QueuedCompletion): Promise<void> {
  // 1) Photos — deterministic paths keyed by queue time + photo id. Upsert
  //    would need storage UPDATE permission crews rightly don't have, so we
  //    insert and treat "already exists" (a previous half-finished replay)
  //    as success — same idempotency, no policy widening.
  const photoPayload: Array<{ storage_path: string; caption: string }> = [];
  for (const p of r.photos) {
    const path = `${r.companyId}/${r.jobId}/offline-${r.queuedAt}-${p.id}.${p.ext}`;
    const { error } = await supabase.storage
      .from('job-photos')
      .upload(path, p.blob, { contentType: p.contentType, upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Photo upload failed: ${error.message}`);
    }
    photoPayload.push({ storage_path: path, caption: p.isAfter ? 'After' : 'Before' });
  }

  // 2) Signature — same insert-or-already-there approach.
  let signatureUrl = '';
  if (r.signatureBlob) {
    const sigPath = `${r.companyId}/${r.jobId}/offline-${r.queuedAt}.png`;
    const { error } = await supabase.storage
      .from('job-signatures')
      .upload(sigPath, r.signatureBlob, { contentType: 'image/png', upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Signature upload failed: ${error.message}`);
    }
    signatureUrl = supabase.storage.from('job-signatures').getPublicUrl(sigPath).data.publicUrl;
  }

  // 3) Atomic completion.
  const { error: rpcErr } = await supabase.rpc('complete_job', {
    p_job_id: r.jobId,
    p_signature_url: signatureUrl,
    p_signed_by_name: r.signerName.trim(),
    p_photos: photoPayload,
    p_clock_event_lat: r.lat,
    p_clock_event_lng: r.lng,
    p_user_id: r.userId,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  // 4) Non-critical side effects (notes + dispatcher notification), same as
  //    the online path. Best-effort — the completion itself is already in.
  if (r.notes.trim()) {
    // supabase-js builders are lazy — .then() forces the fire-and-forget
    // to actually execute (a bare `void builder` never sends the request).
    void supabase.from('activity_log').insert({
      company_id: r.companyId,
      entity_type: 'job',
      entity_id: r.jobId,
      action: 'completion_notes',
      actor_id: r.userId,
      metadata: { completion_notes: r.notes, synced_from_offline: true, queued_at: new Date(r.queuedAt).toISOString() },
    }).then(() => {});
  }
  void (async () => {
    const { data: dispatchers } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', r.companyId)
      .in('role', ['owner', 'dispatcher']);
    if (!dispatchers?.length) return;
    await supabase.from('notifications').insert(
      dispatchers.map((d: { id: string }) => ({
        company_id: r.companyId,
        profile_id: d.id,
        title: `Job completed (synced from offline): ${r.jobTitle}`,
        body: r.clientName,
        entity_type: 'job',
        entity_id: r.jobId,
      })),
    );
  })();
  void supabase.rpc('refresh_analytics').then(() => {});
}
