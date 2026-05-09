'use client';

import { useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { SignaturePad, type SigCanvasType } from '@/components/shared/signature-pad';
import {
  ChevronLeft, PenLine, Trash2, Loader2, CheckCircle2, Camera, X, Image as ImageIcon,
} from 'lucide-react';
import type { Job, JobLineItem } from '@/types';

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
  uploadedPath?: string;
  isAfter: boolean;
  uploading: boolean;
  error?: string;
}

type JobDetail = Job & {
  client: { name: string; service_address: string } | null;
};

type LineItemWithService = JobLineItem & {
  service: { name: string } | null;
};

export default function CompleteJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const sigRef = useRef<SigCanvasType>(null);

  const [job, setJob] = useState<JobDetail | null>(null);
  const [lineItems, setLineItems] = useState<LineItemWithService[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    async function load() {
      const [jobRes, lineRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*, client:clients(name,service_address)')
          .eq('id', id)
          .single(),
        supabase
          .from('job_line_items')
          .select('*, service:services(name)')
          .eq('job_id', id)
          .order('created_at'),
      ]);
      if (jobRes.data) {
        setJob(jobRes.data as JobDetail);
        setCompanyId((jobRes.data as JobDetail).company_id);
      }
      setLineItems((lineRes.data ?? []) as LineItemWithService[]);
      setLoading(false);
    }
    load();
  }, [id]);

  function handleSigEnd() {
    setSigEmpty(sigRef.current?.isEmpty() ?? true);
  }

  function clearSig() {
    sigRef.current?.clear();
    setSigEmpty(true);
  }

  // ── Photos ─────────────────────────────────────────────────────────────
  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (!companyId) return;

    // Show previews immediately, then upload in the background.
    const fresh: PendingPhoto[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      isAfter: true,
      uploading: true,
    }));
    setPhotos((prev) => [...prev, ...fresh]);
    e.target.value = '';

    // Sequential upload — keeps the UI responsive on slow networks and
    // avoids saturating the worker's mobile data plan.
    for (const p of fresh) {
      try {
        const ext = (p.file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${companyId}/${id}/${Date.now()}-${p.id}.${ext}`;
        const { error: uploadErr } = await supabase
          .storage
          .from('job-photos')
          .upload(path, p.file, { contentType: p.file.type, upsert: false });
        if (uploadErr) throw uploadErr;

        setPhotos((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, uploadedPath: path, uploading: false } : x,
          ),
        );
      } catch (err) {
        setPhotos((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, uploading: false, error: (err as Error).message ?? 'Upload failed' }
              : x,
          ),
        );
      }
    }
  }

  function togglePhotoBeforeAfter(photoId: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isAfter: !p.isAfter } : p)),
    );
  }

  async function removePhoto(photoId: string) {
    const photo = photos.find((p) => p.id === photoId);
    if (photo?.uploadedPath) {
      // Best-effort cleanup — if it fails the photo just won't appear since
      // we never wrote a job_photos row yet.
      try {
        await supabase.storage.from('job-photos').remove([photo.uploadedPath]);
      } catch {}
    }
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  async function handleSubmit() {
    if (!userId || !companyId) return;
    if (photos.some((p) => p.uploading)) {
      setError('Wait for photos to finish uploading before completing.');
      return;
    }
    setSubmitting(true);
    setError(null);

    // Upload signature → job-signatures bucket → jobs.signature_url.
    let signatureUrl: string | null = null;
    if (!sigRef.current?.isEmpty()) {
      try {
        const dataUrl = sigRef.current?.getTrimmedCanvas().toDataURL('image/png') ?? '';
        const blob = await (await fetch(dataUrl)).blob();
        const sigPath = `${companyId}/${id}/${Date.now()}.png`;
        const { error: uploadErr } = await supabase
          .storage
          .from('job-signatures')
          .upload(sigPath, blob, { contentType: 'image/png', upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: pub } = supabase.storage.from('job-signatures').getPublicUrl(sigPath);
        signatureUrl = pub.publicUrl;
      } catch (err) {
        setError(`Signature upload failed: ${(err as Error).message ?? 'unknown'}`);
        setSubmitting(false);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const jobPatch: Record<string, unknown> = {
      status: 'complete',
      actual_end: nowIso,
      updated_at: nowIso,
    };
    if (signatureUrl) {
      jobPatch.signature_url = signatureUrl;
      jobPatch.signed_by_name = signerName.trim() || null;
      jobPatch.signed_at = nowIso;
    }

    const { error: jobErr } = await supabase
      .from('jobs')
      .update(jobPatch)
      .eq('id', id);

    if (jobErr) {
      setError(jobErr.message);
      setSubmitting(false);
      return;
    }

    // Persist completed-photo rows. Skip any that failed to upload.
    const uploadedPhotos = photos.filter((p) => p.uploadedPath && !p.error);
    if (uploadedPhotos.length > 0) {
      await supabase.from('job_photos').insert(
        uploadedPhotos.map((p) => ({
          company_id: companyId,
          job_id: id,
          uploaded_by: userId,
          storage_path: p.uploadedPath,
          caption: p.isAfter ? 'After' : 'Before',
        })),
      );
    }

    // Final clock-out if user is still clocked in
    const { data: openClockIn } = await supabase
      .from('clock_events')
      .select('id')
      .eq('job_id', id)
      .eq('profile_id', userId)
      .eq('event_type', 'clock_in')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openClockIn) {
      const hasClockOut = await supabase
        .from('clock_events')
        .select('id')
        .eq('job_id', id)
        .eq('profile_id', userId)
        .eq('event_type', 'clock_out')
        .gt('created_at', openClockIn.id) // compare by ordering, not id
        .maybeSingle();

      if (!hasClockOut.data) {
        await supabase.from('clock_events').insert({
          company_id: companyId,
          job_id: id,
          profile_id: userId,
          event_type: 'clock_out',
        });
      }
    }

    // Activity log entry. Signature is now on the job row itself; we
    // keep notes here since they're free-form completion context.
    await supabase.from('activity_log').insert({
      company_id: companyId,
      entity_type: 'job',
      entity_id: id,
      action: 'status_changed_to_complete',
      actor_id: userId,
      metadata: {
        completion_notes: notes || null,
        photo_count: uploadedPhotos.length,
        signed: !!signatureUrl,
      },
    });

    // Notify the dispatcher (anyone with owner/dispatcher role in the company)
    const { data: dispatchers } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .in('role', ['owner', 'dispatcher']);

    if (dispatchers?.length) {
      await supabase.from('notifications').insert(
        dispatchers.map((d: { id: string }) => ({
          company_id: companyId,
          profile_id: d.id,
          title: `Job completed: ${job?.title ?? id}`,
          body: job?.client?.name
            ? `${job.client.name} — ${job.client.service_address}`
            : undefined,
          entity_type: 'job',
          entity_id: id,
        }))
      );
    }

    void supabase.rpc('refresh_analytics');
    setDone(true);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return <p className="text-sm text-muted-foreground text-center py-16">Job not found.</p>;
  }

  const grandTotal = lineItems.reduce((s, li) => s + (li.total ?? 0), 0);

  // Success state
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
        >
          <CheckCircle2 className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Job Complete!</h1>
          <p className="text-sm text-muted-foreground mt-1">{job.title}</p>
          {job.client && (
            <p className="text-xs text-muted-foreground">{job.client.name}</p>
          )}
        </div>
        <Button
          onClick={() => router.push('/today')}
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
          className="w-full max-w-xs"
        >
          Back to Today's Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Back */}
      <div>
        <Link href={`/job/${id}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Job
        </Link>
        <h1 className="text-xl font-bold mt-2">Complete Job</h1>
        <p className="text-sm text-muted-foreground">{job.title}</p>
        {job.client && (
          <p className="text-xs text-muted-foreground">{job.client.name}</p>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <StatusBadge status={job.status} type="job" />
        {job.client?.service_address && (
          <span className="text-xs text-muted-foreground truncate">
            {job.client.service_address}
          </span>
        )}
      </div>

      {/* Line items summary */}
      {lineItems.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Services Rendered
          </p>
          <div className="space-y-2">
            {lineItems.map((li) => (
              <div key={li.id} className="flex justify-between text-sm gap-2">
                <span className="truncate">
                  {li.description ?? li.service?.name ?? '—'}
                  <span className="text-muted-foreground"> ×{li.quantity}</span>
                </span>
                <span className="font-medium tabular-nums shrink-0">
                  {formatCurrency(li.total ?? 0)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--color-brand-green-raw)' }}
              >
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Completion notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Completion Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any notes about the job, issues encountered, materials used…"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
        />
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Photos (optional)</span>
          </div>
          <label
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-accent/40"
          >
            <Camera className="h-3.5 w-3.5" />
            Add photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handlePhotoPick}
            />
          </label>
        </div>
        {photos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Snap before/after shots so dispatch and the customer have a record.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <li
                key={p.id}
                className="relative rounded-lg border overflow-hidden bg-muted/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                {p.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                {p.error && (
                  <div className="absolute inset-0 bg-rose-600/80 flex items-center justify-center text-[10px] text-white text-center px-1">
                    Failed
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => togglePhotoBeforeAfter(p.id)}
                  className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: p.isAfter ? 'var(--orange)' : '#1C2B1A',
                    color: '#fff',
                  }}
                  title="Toggle before/after label"
                >
                  {p.isAfter ? 'After' : 'Before'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Signature pad */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Customer Signature</span>
          </div>
          {!sigEmpty && (
            <button
              onClick={clearSig}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="rounded-xl border bg-white overflow-hidden touch-none">
          <SignaturePad
            ref={sigRef}
            onEnd={handleSigEnd}
            canvasProps={{
              className: 'w-full',
              height: 180,
              style: { touchAction: 'none' },
            }}
            backgroundColor="white"
            penColor="#1C2B1A"
          />
        </div>
        {sigEmpty && (
          <p className="text-xs text-muted-foreground">
            Have the customer sign above to confirm completion.
          </p>
        )}
        {!sigEmpty && (
          <div className="space-y-1.5 mt-2">
            <label className="text-xs font-medium" htmlFor="signer-name">
              Customer name (printed)
            </label>
            <Input
              id="signer-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="e.g., John Smith"
              className="h-9 text-sm"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-12 text-base font-semibold gap-2"
        style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        {submitting ? 'Submitting…' : 'Mark Job Complete'}
      </Button>
    </div>
  );
}
