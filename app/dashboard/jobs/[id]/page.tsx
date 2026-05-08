export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusWorkflow } from '@/components/jobs/status-workflow';
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
  };
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
        <Link
          href={`/dashboard/jobs/${id}/edit`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Edit className="h-4 w-4 mr-1.5" /> Edit
        </Link>
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
