export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusWorkflow } from '@/components/jobs/status-workflow';
import { JobActions } from '@/components/jobs/job-actions';
import { JobCostingTab } from '@/components/jobs/job-costing-tab';
import { JobFormsSection } from '@/components/forms/job-forms-section';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatCurrency } from '@/lib/utils';
import { rruleToText } from '@/lib/rrule-helpers';
import {
  Edit, Calendar, Users, MapPin, Repeat2, FileText, Clock, Activity,
} from 'lucide-react';
import type { Job, JobLineItem, JobService, ActivityLog } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [jobRes, jobServicesRes, lineItemsRes, activityRes, photosRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('*, client:clients(id,name,service_address,phone), crew:crews(id,name,color)')
      .eq('id', id)
      .single(),
    supabase
      .from('job_services')
      .select('*, service:services(name,category)')
      .eq('job_id', id)
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('job_line_items')
      .select('*, service:services(name,category)')
      .eq('job_id', id)
      .order('created_at'),
    supabase
      .from('activity_log')
      .select('*, actor:profiles(full_name)')
      .eq('entity_id', id)
      .eq('entity_type', 'job')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('job_photos')
      .select('id, storage_path, caption, created_at, uploaded_by')
      .eq('job_id', id)
      .order('created_at'),
  ]);

  if (jobRes.error || !jobRes.data) notFound();

  const job = jobRes.data as Job & {
    client: { id: string; name: string; service_address: string; phone?: string } | null;
    crew: { id: string; name: string; color: string } | null;
    estimated_labor_hours?: number;
    estimated_labor_cost?: number;
    estimated_materials_cost?: number;
    estimated_equipment_cost?: number;
    revenue?: number;
  };

  // Pull company overhead and any linked invoice's total for revenue.
  const [{ data: { user } }, invoiceRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('invoices')
      .select('total')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const userId = user?.id ?? null;
  const { data: profile } = userId
    ? await supabase
        .from('profiles')
        .select('company_id, company:companies(overhead_pct)')
        .eq('id', userId)
        .single()
    : { data: null };
  const companyId = (profile as { company_id?: string } | null)?.company_id ?? null;
  const overheadPct = Number(
    (profile as { company?: { overhead_pct?: number } | null } | null)?.company?.overhead_pct ?? 15
  );
  const invoiceRevenue = Number((invoiceRes.data as { total?: number } | null)?.total ?? 0);
  const revenueFallback = invoiceRevenue > 0
    ? invoiceRevenue
    : Number((job.revenue as number | undefined) ?? 0);

  const jobServices = (jobServicesRes.data ?? []) as (JobService & { service: { name: string; category: string } | null })[];
  const legacyLineItems = (lineItemsRes.data ?? []) as (JobLineItem & { service: { name: string; category: string } | null })[];

  // The services spine is the source of truth; fall back to legacy line items
  // for jobs created before migration 043. Normalize both into one shape.
  const serviceRows = jobServices.length > 0
    ? jobServices.map((s) => ({
        id: s.id,
        name: s.custom_name || s.service?.name || '—',
        category: s.service?.category ?? null,
        quantity: Number(s.quantity ?? 1),
        duration_minutes: s.duration_minutes ?? null,
        total: Number(s.price ?? 0) * Number(s.quantity ?? 1),
      }))
    : legacyLineItems.map((li) => ({
        id: li.id,
        name: li.description || li.service?.name || '—',
        category: li.service?.category ?? null,
        quantity: Number(li.quantity ?? 1),
        duration_minutes: null as number | null,
        total: Number(li.total ?? 0),
      }));

  const activity = (activityRes.data ?? []) as (ActivityLog & { actor: { full_name: string | null } | null })[];

  type PhotoRow = { id: string; storage_path: string; caption: string | null; created_at: string };
  const photoRows = (photosRes.data ?? []) as PhotoRow[];
  const photos = photoRows.map((p) => ({
    ...p,
    publicUrl: supabase.storage.from('job-photos').getPublicUrl(p.storage_path).data.publicUrl,
  }));

  const grandTotal = serviceRows.reduce((sum, s) => sum + (s.total ?? 0), 0);

  function actionLabel(action: string): string {
    return action.replace(/_/g, ' ').replace('status changed to', 'Status →');
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/dashboard/jobs" className="text-xs text-muted-foreground hover:underline">
              ← Jobs
            </Link>
          </div>
          <h1 className="text-2xl font-bold mb-3">{job.title}</h1>

          {/* Status workflow */}
          <StatusWorkflow jobId={job.id} status={job.status} />
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          <Link
            href={`/dashboard/jobs/${id}/edit`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Link>
          <JobActions
            jobId={id}
            jobTitle={job.title}
            status={job.status}
            clientId={job.client?.id ?? null}
            crewId={job.crew?.id ?? null}
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* Details card */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          {job.scheduled_date && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{formatDate(job.scheduled_date)}</p>
                {(job.scheduled_start || job.scheduled_end) && (
                  <p className="text-xs text-muted-foreground">
                    {(job.scheduled_start as string | null)?.slice(0, 5)}
                    {job.scheduled_end && ` – ${(job.scheduled_end as string).slice(0, 5)}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {job.client && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <Link href={`/dashboard/clients/${job.client.id}`} className="text-sm font-medium hover:underline">
                  {job.client.name}
                </Link>
                <p className="text-xs text-muted-foreground">{job.client.service_address}</p>
              </div>
            </div>
          )}

          {job.crew && (
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: job.crew.color }}
                />
                <p className="text-sm font-medium">{job.crew.name}</p>
              </div>
            </div>
          )}

          {job.is_recurring && job.recurrence_rule && (
            <div className="flex items-center gap-3">
              <Repeat2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground capitalize">
                Repeats {rruleToText(job.recurrence_rule)}
              </p>
            </div>
          )}

          {job.actual_start && (
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Started {new Date(job.actual_start).toLocaleString()}
                {job.actual_end && ` · Ended ${new Date(job.actual_end).toLocaleString()}`}
              </p>
            </div>
          )}

          {job.notes && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
              </div>
            </>
          )}
        </div>

        {/* Costing — second section so the profit signal is immediately visible. */}
        {companyId && userId && (
          <div className="rounded-xl border-2 bg-card p-5" style={{ borderColor: 'var(--orange)' }}>
            <div className="flex items-center gap-2 mb-4">
              <span aria-hidden className="text-lg">💰</span>
              <h2 className="text-base font-bold uppercase tracking-wide">Costing</h2>
            </div>
            <JobCostingTab
              jobId={id}
              companyId={companyId}
              userId={userId}
              initialEstimated={{
                labor_hours: Number(job.estimated_labor_hours ?? 0),
                labor_cost: Number(job.estimated_labor_cost ?? 0),
                materials_cost: Number(job.estimated_materials_cost ?? 0),
                equipment_cost: Number(job.estimated_equipment_cost ?? 0),
              }}
              initialRevenue={revenueFallback}
              overheadPct={overheadPct}
            />
          </div>
        )}

        {/* Services */}
        {serviceRows.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Services</h2>
            <div className="space-y-2">
              {serviceRows.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_60px_70px_90px] gap-3 items-center text-sm"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    {s.category && (
                      <p className="text-xs text-muted-foreground capitalize">{s.category}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-center tabular-nums">×{s.quantity}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {s.duration_minutes != null ? `${s.duration_minutes} min` : '—'}
                  </span>
                  <span className="text-right tabular-nums font-semibold">
                    {formatCurrency(s.total ?? 0)}
                  </span>
                </div>
              ))}

              <Separator className="my-2" />
              <div className="flex justify-end">
                <div className="flex items-center gap-6">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span
                    className="text-xl font-bold tabular-nums"
                    style={{ color: 'var(--color-brand-green-raw)' }}
                  >
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Photos + signature (captured at job complete) */}
        {(photos.length > 0 || job.signature_url) && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span aria-hidden>📸</span>
              <h2 className="text-sm font-semibold">Completion proof</h2>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square rounded-lg overflow-hidden border bg-muted/30 hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.publicUrl} alt={p.caption ?? 'Job photo'} className="w-full h-full object-cover" />
                    {p.caption && (
                      <span
                        className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                      >
                        {p.caption}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
            {job.signature_url && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Customer signature
                  {job.signed_by_name && <> · {job.signed_by_name}</>}
                  {job.signed_at && (
                    <span className="text-muted-foreground font-normal">
                      {' '}· {new Date(job.signed_at).toLocaleString()}
                    </span>
                  )}
                </p>
                <div className="rounded-lg border bg-white p-3 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={job.signature_url}
                    alt="Customer signature"
                    className="max-h-32"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Forms */}
        {companyId && userId && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span aria-hidden>📋</span>
              <h2 className="text-sm font-semibold">Forms</h2>
            </div>
            <JobFormsSection
              jobId={id}
              clientId={job.client?.id ?? null}
              companyId={companyId}
              userId={userId}
            />
          </div>
        )}

        {/* Activity log */}
        {activity.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Activity</h2>
            </div>
            <ol className="relative border-l border-border ml-3 space-y-4">
              {activity.map((entry) => (
                <li key={entry.id} className="pl-4 -ml-px">
                  <div
                    className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background"
                    style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
                  />
                  <p className="text-sm font-medium capitalize">{actionLabel(entry.action ?? '')}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.actor?.full_name ?? 'System'} ·{' '}
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
