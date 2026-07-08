'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { ServicePicker, persistJobServices, type ServiceDraft } from '@/components/shared/service-picker';
import { RecurrencePicker } from '@/components/jobs/recurrence-picker';
import { NoteTemplatePicker } from '@/components/jobs/note-template-picker';
import { Separator } from '@/components/ui/separator';
import { resolveJobDurationMinutes } from '@/lib/vroom';
import { saveJobAsTemplate } from '@/lib/job-templates';
import { toast } from 'sonner';
import { BookmarkPlus, Calendar, Clock, Hourglass, Target } from 'lucide-react';
import type { Job, Crew, JobService } from '@/types';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  status: z.enum(['unscheduled', 'scheduled', 'en_route', 'in_progress', 'complete', 'cancelled', 'issue']),
  scheduled_date: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
});

type TimeMode = 'anytime' | 'window' | 'arrival';

function detectTimeMode(initial: Partial<Job> | undefined): TimeMode {
  if (initial?.scheduled_start) return 'arrival';
  if (initial?.time_window_start && initial?.time_window_end) return 'window';
  return 'anytime';
}

function toHHMM(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function hhmmToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function minutesToHHMM(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function splitDuration(total: number | null | undefined): { hours: string; minutes: string } {
  if (total == null || !Number.isFinite(total) || total <= 0) return { hours: '', minutes: '' };
  const h = Math.floor(total / 60);
  const m = total % 60;
  return { hours: h ? String(h) : '', minutes: m ? String(m) : (h ? '' : '0') };
}

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormProps {
  initialData?: Partial<Job>;
  companyId: string;
  crews: Crew[];
  initialServices?: JobService[];
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
  initialServices = [],
  spawnedFromTemplateId,
  clientName,
}: JobFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [clientId, setClientId] = useState(initialData?.client_id ?? '');
  const [crewId, setCrewId] = useState(initialData?.crew_id ?? '');
  const [rrule, setRrule] = useState<string | null>(initialData?.recurrence_rule ?? null);

  // Scheduling — three mutually-exclusive modes, plus a duration that's
  // optional with a smart default. See detectTimeMode() for how we figure
  // out which mode an existing job is in.
  const [timeMode, setTimeMode] = useState<TimeMode>(detectTimeMode(initialData));
  const initialDur = splitDuration(initialData?.estimated_duration_minutes);
  const [durationHours, setDurationHours] = useState<string>(initialDur.hours);
  const [durationMinutes, setDurationMinutes] = useState<string>(initialDur.minutes);
  const [arrivalTime, setArrivalTime] = useState<string>(toHHMM(initialData?.scheduled_start));
  const [windowStart, setWindowStart] = useState<string>(toHHMM(initialData?.time_window_start));
  const [windowEnd, setWindowEnd] = useState<string>(toHHMM(initialData?.time_window_end));
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  // Save-as-template controls. Hidden when there's no client selected,
  // since a template must be tied to a client.
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [resolvedClientName, setResolvedClientName] = useState<string | null>(clientName ?? null);
  const [serviceItems, setServiceItems] = useState<ServiceDraft[]>(
    initialServices.map((s) => ({
      id: s.id || undefined,
      service_id: s.service_id ?? null,
      custom_name: s.custom_name ?? s.service?.name ?? '',
      quantity: Number(s.quantity ?? 1),
      duration_minutes: s.duration_minutes ?? null,
      price: Number(s.price ?? 0),
      notes: s.notes ?? null,
      _key: s.id || crypto.randomUUID(),
    }))
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      status: initialData?.status ?? 'unscheduled',
      scheduled_date: initialData?.scheduled_date ?? '',
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

  // Live "default" duration the resolver would pick — used only to render the
  // placeholder hint. The actual VROOM duration comes from the override-if-set
  // / resolve-at-optimize chain in lib/vroom.ts, which reads the same spine.
  const calculatedDurationMinutes = useMemo(() => {
    return resolveJobDurationMinutes(
      {
        scheduled_start: null,
        scheduled_end: null,
        job_services: serviceItems.map((s) => ({
          duration_minutes: s.duration_minutes,
          quantity: s.quantity,
        })),
      },
      { jobTitle: initialData?.title ?? '(new job)' },
    );
  }, [serviceItems, initialData?.title]);

  const overrideMinutes = (() => {
    const h = Number(durationHours.trim() || '0');
    const m = Number(durationMinutes.trim() || '0');
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const total = Math.max(0, Math.round(h * 60 + m));
    return total > 0 ? total : null;
  })();
  // Effective duration used for window validation + arrival-end computation.
  // Falls back to the resolver default when the user didn't type one.
  const effectiveDurationMinutes = overrideMinutes ?? calculatedDurationMinutes;

  const calculatedDurationLabel = useMemo(() => {
    const total = calculatedDurationMinutes;
    if (total <= 0) return '—';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }, [calculatedDurationMinutes]);

  const calculatedSource = serviceItems.some((s) => (s.duration_minutes ?? 0) > 0)
    ? 'service durations' : 'category default';

  async function onSubmit(data: JobFormData) {
    setServerError(null);
    setScheduleError(null);

    // Translate the three-mode UI into the underlying jobs columns. Mode
    // semantics are intentionally narrow so VROOM gets unambiguous input:
    //   Mode A (anytime): everything null
    //   Mode B (window):  time_window_start/_end only; scheduled_start NULL
    //   Mode C (arrival): both pairs locked to [arrival, arrival+duration]
    let scheduled_start: string | null = null;
    let scheduled_end: string | null = null;
    let tw_start: string | null = null;
    let tw_end: string | null = null;

    if (timeMode === 'window') {
      if (!windowStart || !windowEnd) {
        setScheduleError('Set both a start and end time for the window.');
        return;
      }
      const ws = hhmmToMinutes(windowStart);
      const we = hhmmToMinutes(windowEnd);
      if (ws === null || we === null || we <= ws) {
        setScheduleError('Window end must be after window start.');
        return;
      }
      if (we - ws < effectiveDurationMinutes) {
        setScheduleError(
          `Window is ${we - ws} min — too short for a ${effectiveDurationMinutes}-min job. ` +
          `Widen the window or shorten the duration.`,
        );
        return;
      }
      tw_start = windowStart;
      tw_end = windowEnd;
    } else if (timeMode === 'arrival') {
      if (!arrivalTime) {
        setScheduleError('Set the arrival time.');
        return;
      }
      const am = hhmmToMinutes(arrivalTime);
      if (am === null) {
        setScheduleError('Arrival time is invalid.');
        return;
      }
      const endHHMM = minutesToHHMM(am + effectiveDurationMinutes);
      scheduled_start = arrivalTime;
      scheduled_end = endHHMM;
      // Mode C also writes the tight window so VROOM honors it as a hard
      // constraint, not just a hint on the row.
      tw_start = arrivalTime;
      tw_end = endHHMM;
    }
    // Mode 'anytime' leaves all four columns null.

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
      scheduled_start,
      scheduled_end,
      estimated_duration_minutes: overrideMinutes,
      time_window_start: tw_start,
      time_window_end:   tw_end,
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
      const ctx = await getCompanyContext(supabase);
      const { data: job, error } = await supabase
        .from('jobs')
        .insert({ ...payload, created_by: ctx?.userId })
        .select('id')
        .single();
      if (error || !job) { setServerError(error?.message ?? 'Failed to create job'); return; }
      jobId = job.id;
    }

    // Persist the services spine — inserts new rows, updates edited ones.
    try {
      await persistJobServices(supabase, jobId, serviceItems);
    } catch (err) {
      setServerError((err as Error).message);
      return;
    }

    // Save-as-template — fire-and-forget after the job lands. The job
    // save is the primary action; a template-write failure should toast
    // but not block navigation.
    if (saveAsTemplate && clientId) {
      const finalTemplateName = (templateName || data.title).trim();
      if (finalTemplateName) {
        const ctx = await getCompanyContext(supabase);
        const result = await saveJobAsTemplate(supabase, {
          company_id: companyId,
          client_id: clientId,
          name: finalTemplateName,
          service_id: serviceItems.find((s) => s.service_id)?.service_id ?? null,
          title: data.title,
          notes: data.notes ?? null,
          customer_notes: data.customer_notes ?? null,
          estimated_duration_minutes: overrideMinutes ?? calculatedDurationMinutes,
          time_window_start: payload.time_window_start,
          time_window_end:   payload.time_window_end,
          default_crew_id: crewId || null,
          default_line_items: serviceItems.map((s) => ({
            service_id: s.service_id,
            description: s.custom_name || null,
            quantity: s.quantity,
            unit_price: s.price,
          })),
          created_by: ctx?.userId ?? null,
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

        {/* ─────────── Scheduling ─────────── */}
        <div className="rounded-md border bg-muted/30 px-4 py-4 space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Scheduling
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_date">Date</Label>
              <Input id="scheduled_date" type="date" className="h-11" {...register('scheduled_date')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration_hours" className="inline-flex items-center gap-1">
                <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                Estimated Duration
                <span
                  className="ml-1 cursor-help text-[10px] uppercase tracking-wider text-muted-foreground/70"
                  title="Used for route balancing in VROOM"
                >
                  ⓘ
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="duration_hours"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className="w-20 h-11"
                  aria-label="Hours"
                />
                <span className="text-xs text-muted-foreground">hr</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-20 h-11"
                  aria-label="Minutes"
                  placeholder={String(calculatedDurationMinutes % 60)}
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default: <span className="font-medium">{calculatedDurationLabel}</span> (from {calculatedSource}).
                Leave blank to use the calculated value.
              </p>
            </div>
          </div>

          <Separator />

          {/* When-during-the-day mode picker */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              When during the day?
            </p>

            <ModeRadio
              checked={timeMode === 'anytime'}
              onSelect={() => setTimeMode('anytime')}
              title="Anytime during the workday (8 AM – 5 PM)"
              body="Most jobs work this way. The system picks the best time to fit each crew's route."
            />

            <ModeRadio
              checked={timeMode === 'window'}
              onSelect={() => setTimeMode('window')}
              title="Customer prefers a time window"
              body={`Example: "Customer is home 1–4 PM" — VROOM fits the ${effectiveDurationMinutes}-min job somewhere in that window.`}
            >
              {timeMode === 'window' && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="window_start" className="text-xs">Must be done between</Label>
                      <Input
                        id="window_start"
                        type="time"
                        className="h-11"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="window_end" className="text-xs">and</Label>
                      <Input
                        id="window_end"
                        type="time"
                        className="h-11"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </ModeRadio>

            <ModeRadio
              checked={timeMode === 'arrival'}
              onSelect={() => setTimeMode('arrival')}
              title="Customer needs a specific arrival time"
              body='Example: "Customer requested exactly 9 AM" — job locks to that start time.'
              icon={<Target className="h-3.5 w-3.5" />}
            >
              {timeMode === 'arrival' && (
                <div className="mt-3 max-w-[180px] space-y-1">
                  <Label htmlFor="arrival_time" className="text-xs">Arrive at</Label>
                  <Input
                    id="arrival_time"
                    type="time"
                    className="h-11"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                  />
                  {arrivalTime && (
                    <p className="text-[11px] text-muted-foreground">
                      Locks the job to {arrivalTime} – {minutesToHHMM((hhmmToMinutes(arrivalTime) ?? 0) + effectiveDurationMinutes)}
                    </p>
                  )}
                </div>
              )}
            </ModeRadio>

            {scheduleError && (
              <p className="text-sm text-destructive">{scheduleError}</p>
            )}
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
      </div>

      <Separator />

      {/* --- Recurrence --- */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Recurrence</h2>
        <RecurrencePicker value={rrule} onChange={setRrule} />
      </div>

      <Separator />

      {/* --- Services --- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Services</h2>
        <p className="text-xs text-muted-foreground">
          What gets done on this job. Durations feed route timing; prices feed the invoice.
        </p>
        <ServicePicker
          initialItems={initialServices}
          onChange={setServiceItems}
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

interface ModeRadioProps {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

function ModeRadio({ checked, onSelect, title, body, icon, children }: ModeRadioProps) {
  return (
    <label
      onClick={onSelect}
      className={`block rounded-lg border bg-background px-3 py-2.5 cursor-pointer transition-colors ${
        checked ? 'border-[var(--color-brand-green-raw,#3D6B2C)] ring-1 ring-[var(--color-brand-green-raw,#3D6B2C)]' : 'hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          checked={checked}
          onChange={onSelect}
          className="mt-1 h-4 w-4 accent-[var(--color-brand-green-raw,#3D6B2C)]"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
            {icon}
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{body}</p>
          {children}
        </div>
      </div>
    </label>
  );
}
