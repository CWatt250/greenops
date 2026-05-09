export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusWorkflow } from '@/components/jobs/status-workflow';
import { JobActions } from '@/components/jobs/job-actions';
import { JobCostingTab } from '@/components/jobs/job-costing-tab';
import { LogApplicationSheet } from '@/components/chemicals/log-application-sheet';
import { ChemicalApplicationsList } from '@/components/chemicals/chemical-applications-list';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatCurrency } from '@/lib/utils';
import { rruleToText } from '@/lib/rrule-helpers';
import {
  Edit, Calendar, Users, MapPin, Repeat2, FileText, Clock, Activity,
} from 'lucide-react';
import type { Job, JobLineItem, ActivityLog } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [jobRes, lineItemsRes, activityRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('*, client:clients(id,name,service_address,phone), crew:crews(id,name,color)')
      .eq('id', id)
      .single(),
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

  // Active re-entry interval check — flag if any prior chemical application
  // at this property is still inside its REI window.
  let activeReiUntil: string | null = null;
  if (job.client?.id) {
    const { data: activeRei } = await supabase
      .from('chemical_applications')
      .select('reentry_until')
      .eq('client_id', job.client.id)
      .gt('reentry_until', new Date().toISOString())
      .order('reentry_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    activeReiUntil = (activeRei as { reentry_until?: string } | null)?.reentry_until ?? null;
  }

  const lineItems = (lineItemsRes.data ?? []) as (JobLineItem & { service: { name: string; category: string } | null })[];
  const activity = (activityRes.data ?? []) as (ActivityLog & { actor: { full_name: string | null } | null })[];

  const grandTotal = lineItems.reduce((sum, li) => sum + (li.total ?? 0), 0);

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

        {/* Line items */}
        {lineItems.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Line Items</h2>
            <div className="space-y-2">
              {lineItems.map((li) => (
                <div
                  key={li.id}
                  className="grid grid-cols-[1fr_60px_90px_90px] gap-3 items-center text-sm"
                >
                  <div>
                    <p className="font-medium">{li.description ?? li.service?.name ?? '—'}</p>
                    {li.service?.category && (
                      <p className="text-xs text-muted-foreground capitalize">{li.service.category}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-center tabular-nums">×{li.quantity}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(li.unit_price)}
                  </span>
                  <span className="text-right tabular-nums font-semibold">
                    {formatCurrency(li.total ?? 0)}
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

        {/* Costing */}
        {companyId && userId && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <span aria-hidden>💰</span>
              <h2 className="text-sm font-semibold">Costing</h2>
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

        {/* Chemicals */}
        {companyId && userId && job.client?.id && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span aria-hidden>🧪</span>
                <h2 className="text-sm font-semibold">Chemicals</h2>
              </div>
              <LogApplicationSheet
                jobId={id}
                clientId={job.client.id}
                companyId={companyId}
                userId={userId}
                defaultAddress={job.client.service_address}
              />
            </div>
            {activeReiUntil && (
              <div className="rounded-md bg-amber-100 text-amber-700 px-3 py-2 text-xs mb-3 flex items-start gap-2">
                <span aria-hidden>⚠️</span>
                <p>
                  This property has an active re-entry interval until{' '}
                  <strong>{new Date(activeReiUntil).toLocaleString()}</strong>.
                  Crews should not enter until this expires.
                </p>
              </div>
            )}
            <ChemicalApplicationsList jobId={id} showExport={false} />
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
