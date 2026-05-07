'use client';

import { useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { SignaturePad, type SigCanvasType } from '@/components/shared/signature-pad';
import { ChevronLeft, PenLine, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import type { Job, JobLineItem } from '@/types';

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
  const [notes, setNotes] = useState('');
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

  async function handleSubmit() {
    if (!userId || !companyId) return;
    setSubmitting(true);
    setError(null);

    const signatureDataUrl = sigRef.current?.isEmpty()
      ? null
      : sigRef.current?.getTrimmedCanvas().toDataURL('image/png') ?? null;

    // Update job: complete + actual_end
    const { error: jobErr } = await supabase
      .from('jobs')
      .update({
        status: 'complete',
        actual_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (jobErr) {
      setError(jobErr.message);
      setSubmitting(false);
      return;
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

    // Activity log entry with signature
    await supabase.from('activity_log').insert({
      company_id: companyId,
      entity_type: 'job',
      entity_id: id,
      action: 'status_changed_to_complete',
      actor_id: userId,
      metadata: {
        completion_notes: notes || null,
        signature_data_url: signatureDataUrl,
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
