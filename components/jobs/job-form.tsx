'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { LineItemsTable, type LineItemDraft } from '@/components/jobs/line-items-table';
import { RecurrencePicker } from '@/components/jobs/recurrence-picker';
import { NoteTemplatePicker } from '@/components/jobs/note-template-picker';
import { Separator } from '@/components/ui/separator';
import { resolveJobDurationMinutes } from '@/lib/vroom';
import { saveJobAsTemplate } from '@/lib/job-templates';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, BookmarkPlus } from 'lucide-react';
import type { Job, Crew, Service } from '@/types';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  status: z.enum(['unscheduled', 'scheduled', 'en_route', 'in_progress', 'complete', 'cancelled', 'issue']),
  scheduled_date: z.string().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  estimated_duration_minutes: z.string().optional(),
  time_window_start: z.string().optional(),
  time_window_end: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
}).refine(
  (d) => !d.time_window_start || !d.time_window_end || d.time_window_end > d.time_window_start,
  { path: ['time_window_end'], message: 'End must be after start.' },
);

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormProps {
  initialData?: Partial<Job>;
  companyId: string;
  crews: Crew[];
  initialLineItems?: import('@/types').JobLineItem[];
  /** Template that seeded this form (used to bump its usage counter after a
   *  successful save). Only set when /dashboard/jobs/new was opened with
   *  ?template_id=…. */
  spawnedFromTemplateId?: string;
  /** Client name shown next to the "Save as template" checkbox so the user
   *  knows which property the template is being attached to. */
  clientName?: string;
}

export function JobForm({
  initialData,
  companyId,
  crews,
  initialLineItems = [],
  spawnedFromTemplateId,
  clientName,
}: JobFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [clientId, setClientId] = useState(initialData?.client_id ?? '');
  const [crewId, setCrewId] = useState(initialData?.crew_id ?? '');
  const [rrule, setRrule] = useState<string | null>(initialData?.recurrence_rule ?? null);
  // Time window UI is collapsed by default; opens when there are saved
  // bounds on the row (editing an existing job that already has a window).
  const [tWindowOpen, setTWindowOpen] = useState(
    !!(initialData?.time_window_start || initialData?.time_window_end),
  );
  // Save-as-template controls. Hidden when there's no client selected,
  // since a template must be tied to a client.
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [resolvedClientName, setResolvedClientName] = useState<string | null>(clientName ?? null);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    initialLineItems.map((li) => ({
      id: li.id,
      service_id: li.service_id ?? null,
      description: li.description ?? '',
      quantity: li.quantity,
      unit_price: li.unit_price,
      total: li.total,
      _key: li.id,
    }))
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      status: initialData?.status ?? 'unscheduled',
      scheduled_date: initialData?.scheduled_date ?? '',
      scheduled_start: initialData?.scheduled_start?.slice(0, 5) ?? '',
      scheduled_end: initialData?.scheduled_end?.slice(0, 5) ?? '',
      estimated_duration_minutes:
        initialData?.estimated_duration_minutes != null
          ? String(initialData.estimated_duration_minutes)
          : '',
      time_window_start: initialData?.time_window_start?.slice(0, 5) ?? '',
      time_window_end: initialData?.time_window_end?.slice(0, 5) ?? '',
      notes: initialData?.notes ?? '',
      customer_notes: initialData?.customer_notes ?? '',
    },
  });

  // When the user picks a client, resolve its name for the "Save as
  // template for [Smith residence]" copy. Only fires if we don't already
  // have a name (the parent route page passes one for the prefill flow).
  useEffect(() => {
    if (!clientId) {
      setResolvedClientName(null);
      return;
    }
    if (clientName && clientId === initialData?.client_id) return;
    let cancelled = false;
    supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setResolvedClientName((data?.name as string) ?? null);
      });
    return () => { cancelled = true; };
  }, [clientId, clientName, initialData?.client_id]);

  // Load the company's services so we can look up estimated_duration_minutes
  // for whatever line items the user selects. Small list, fetched once.
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    supabase
      .from('services')
      .select('id, category, estimated_duration_minutes')
      .eq('is_active', true)
      .then(({ data }) => setServices((data ?? []) as Service[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the fields that feed the duration resolver so the "calculated"
  // hint updates live as the user edits start/end times or line items.
  const watchedStart = watch('scheduled_start');
  const watchedEnd = watch('scheduled_end');
  const watchedDuration = watch('estimated_duration_minutes');

  const calculatedDurationMinutes = useMemo(() => {
    const servicesById = new Map(services.map((s) => [s.id, s]));
    return resolveJobDurationMinutes(
      {
        scheduled_start: watchedStart || null,
        scheduled_end: watchedEnd || null,
        line_items: lineItems.map((li) => ({
          service: li.service_id ? {
            estimated_duration_minutes:
              servicesById.get(li.service_id)?.estimated_duration_minutes ?? null,
            category: servicesById.get(li.service_id)?.category ?? null,
          } : null,
        })),
      },
      { jobTitle: initialData?.title ?? '(new job)' },
    );
  }, [watchedStart, watchedEnd, lineItems, services, initialData?.title]);

  const overrideMinutes = (() => {
    const raw = (watchedDuration ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();

  async function onSubmit(data: JobFormData) {
    setServerError(null);

    const recurring = !!rrule;
    // Per spec: only persist a duration when the user typed one. Otherwise
    // leave NULL so VROOM's resolveJobDurationMinutes() recomputes from
    // the priority chain at optimize-time (handles edits to line items /
    // service categories that would otherwise be stale on the row).
    const payload = {
      title: data.title,
      status: data.status,
      company_id: companyId,
      client_id: clientId || null,
      crew_id: crewId || null,
      scheduled_date: data.scheduled_date || null,
      scheduled_start: data.scheduled_start || null,
      scheduled_end: data.scheduled_end || null,
      estimated_duration_minutes: overrideMinutes,
      time_window_start: tWindowOpen && data.time_window_start ? data.time_window_start : null,
      time_window_end:   tWindowOpen && data.time_window_end   ? data.time_window_end   : null,
      notes: data.notes || null,
      customer_notes: data.customer_notes || null,
      is_recurring: recurring,
      recurrence_rule: rrule ?? null,
      // Recurring-materialization columns (migration 034). The parent row
      // tracks the rule + how far we've expanded; child occurrence rows
      // get spawned by materializeRecurringJob() below.
      is_recurring_parent: recurring,
      rrule: rrule ?? null,
    };

    let jobId: string;

    if (initialData?.id) {
      const { error } = await supabase
        .from('jobs')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', initialData.id);
      if (error) { setServerError(error.message); return; }
      jobId = initialData.id;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: job, error } = await supabase
        .from('jobs')
        .insert({ ...payload, created_by: user?.id })
        .select('id')
        .single();
      if (error || !job) { setServerError(error?.message ?? 'Failed to create job'); return; }
      jobId = job.id;
    }

    // Persist new line items and read back generated totals
    const newItems = lineItems.filter((i) => !i.id);
    if (newItems.length) {
      const { error } = await supabase.from('job_line_items').insert(
        newItems.map((i) => ({
          job_id: jobId,
          service_id: i.service_id && i.service_id !== '__custom__' ? i.service_id : null,
          description: i.description || null,
          quantity: i.quantity,
          unit_price: i.unit_price,
        }))
      );
      if (error) { setServerError(error.message); return; }
    }

    // Save-as-template — fire-and-forget after the job lands. The job
    // save is the primary action; a template-write failure should toast
    // but not block navigation.
    if (saveAsTemplate && clientId) {
      const finalTemplateName = (templateName || data.title).trim();
      if (finalTemplateName) {
        const { data: { user } } = await supabase.auth.getUser();
        const result = await saveJobAsTemplate(supabase, {
          company_id: companyId,
          client_id: clientId,
          name: finalTemplateName,
          service_id: lineItems.find((li) => li.service_id && li.service_id !== '__custom__')?.service_id ?? null,
          title: data.title,
          notes: data.notes ?? null,
          customer_notes: data.customer_notes ?? null,
          estimated_duration_minutes: overrideMinutes ?? calculatedDurationMinutes,
          time_window_start: payload.time_window_start,
          time_window_end:   payload.time_window_end,
          default_crew_id: crewId || null,
          default_line_items: lineItems.map((li) => ({
            service_id: li.service_id && li.service_id !== '__custom__' ? li.service_id : null,
            description: li.description ?? null,
            quantity: li.quantity,
            unit_price: li.unit_price,
          })),
          created_by: user?.id ?? null,
        });
        if (result.ok) {
          const propertyLabel = resolvedClientName ?? 'this property';
          toast.success(`Saved as template — reuse it from any future job at ${propertyLabel}.`);
        } else {
          toast.error(`Template save failed: ${result.error}`);
        }
      }
    }

    // If this job was spawned from a template, bump that template's usage
    // counter. Atomic via RPC.
    if (spawnedFromTemplateId) {
      try {
        await supabase.rpc('increment_template_usage', { p_template_id: spawnedFromTemplateId });
      } catch {
        // Non-fatal — counters drift, but the job is saved.
      }
    }

    // Materialize 6 months of occurrences for recurring jobs. Without
    // this the schedule view stays blank past the first instance.
    if (recurring && rrule && data.scheduled_date) {
      try {
        const { materializeRecurringJob, defaultMaterializeHorizon } =
          await import('@/lib/recurring-jobs');
        await materializeRecurringJob(jobId, defaultMaterializeHorizon(), supabase);
      } catch (err) {
        // Non-fatal: parent job is saved; cron will catch up.
        // eslint-disable-next-line no-console
        console.warn('Recurring materialization failed:', (err as Error).message);
      }
    }

    router.push(`/dashboard/jobs/${jobId}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
      {/* --- Core details --- */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Job Title *</Label>
          <Input id="title" placeholder="e.g. Weekly Mow & Edge — Smith Residence" {...register('title')} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Client</Label>
            <ClientCombobox value={clientId} onChange={(id) => setClientId(id)} />
          </div>

          <div className="space-y-2">
            <Label>Crew</Label>
            <Select value={crewId} onValueChange={(v) => setCrewId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Assign a crew…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {crews.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-2">
            <Label htmlFor="scheduled_date">Date</Label>
            <Input id="scheduled_date" type="date" {...register('scheduled_date')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_start">Start Time</Label>
            <Input id="scheduled_start" type="time" {...register('scheduled_start')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_end">End Time</Label>
            <Input id="scheduled_end" type="time" {...register('scheduled_end')} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-2">
            <Label htmlFor="estimated_duration_minutes">
              Estimated duration (min)
              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                used for route balancing
              </span>
            </Label>
            <Input
              id="estimated_duration_minutes"
              type="number"
              min={1}
              step={5}
              placeholder={String(calculatedDurationMinutes)}
              {...register('estimated_duration_minutes')}
            />
            <p className="text-xs text-muted-foreground">
              Calculated default: <span className="font-medium">{calculatedDurationMinutes} min</span>{' '}
              (from {watchedStart && watchedEnd
                ? 'scheduled time window'
                : lineItems.some((li) => li.service_id) ? 'line-item services' : 'service category'}).
              Leave blank to use the calculated value; override only if this one will take longer or shorter.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              defaultValue={initialData?.status ?? 'unscheduled'}
              onValueChange={(v) => setValue('status', v as JobFormData['status'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unscheduled">Unscheduled</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="issue">Issue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Time window — collapsible. NULL = customer is flexible. */}
        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <button
            type="button"
            onClick={() => setTWindowOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={tWindowOpen}
                onChange={(e) => setTWindowOpen(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-input accent-[var(--color-brand-green-raw,#3D6B2C)]"
              />
              Customer requires this job within a specific time window?
            </span>
            {tWindowOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {tWindowOpen && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="time_window_start">Must start after</Label>
                <Input id="time_window_start" type="time" {...register('time_window_start')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time_window_end">Must end before</Label>
                <Input id="time_window_end" type="time" {...register('time_window_end')} />
                {errors.time_window_end && (
                  <p className="text-xs text-destructive">{errors.time_window_end.message}</p>
                )}
              </div>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                Leave blank if the customer is flexible. Set when they need it done
                between specific hours (e.g., before noon, after 2 PM).
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* --- Recurrence --- */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Recurrence</h2>
        <RecurrencePicker value={rrule} onChange={setRrule} />
      </div>

      <Separator />

      {/* --- Line Items --- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Line Items</h2>
        <LineItemsTable
          jobId={initialData?.id}
          initialItems={initialLineItems}
          onChange={setLineItems}
        />
      </div>

      <Separator />

      {/* --- Notes --- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="notes">Internal notes <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">crew only</span></Label>
          <NoteTemplatePicker
            onApply={(body) => {
              const current = (getValues('notes') ?? '').trim();
              const next = current ? `${current}\n\n${body}` : body;
              setValue('notes', next, { shouldDirty: true });
            }}
          />
        </div>
        <textarea
          id="notes"
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Access instructions, special requirements, gate codes — never shown to the customer."
          {...register('notes')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customer-notes">
          Customer-visible notes <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">portal</span>
        </Label>
        <textarea
          id="customer-notes"
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Optional — appears on the customer's portal job card. Leave blank to show nothing."
          {...register('customer_notes')}
        />
      </div>

      {/* --- Save as template --- */}
      {clientId && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2.5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-[var(--color-brand-green-raw,#3D6B2C)]"
            />
            <div className="flex-1 text-sm">
              <p className="font-medium flex items-center gap-1.5">
                <BookmarkPlus className="h-3.5 w-3.5 text-muted-foreground" />
                Save this job as a template for{' '}
                <span className="text-foreground/90">{resolvedClientName ?? 'this property'}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Next time you create a job at this address, spawn a new one from this
                template in one tap.
              </p>
            </div>
          </label>
          {saveAsTemplate && (
            <div className="pl-6 space-y-1.5">
              <Label htmlFor="template_name" className="text-xs">
                Template name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="template_name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={getValues('title') || 'e.g., Weekly Mowing'}
              />
            </div>
          )}
        </div>
      )}

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          {isSubmitting ? 'Saving…' : initialData?.id ? 'Update Job' : 'Create Job'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
