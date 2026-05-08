'use client';

import { useState, useRef } from 'react';
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
import type { Job, Crew } from '@/types';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  status: z.enum(['unscheduled', 'scheduled', 'in_progress', 'complete', 'cancelled', 'issue']),
  scheduled_date: z.string().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  notes: z.string().optional(),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormProps {
  initialData?: Partial<Job>;
  companyId: string;
  crews: Crew[];
  initialLineItems?: import('@/types').JobLineItem[];
}

export function JobForm({ initialData, companyId, crews, initialLineItems = [] }: JobFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [clientId, setClientId] = useState(initialData?.client_id ?? '');
  const [crewId, setCrewId] = useState(initialData?.crew_id ?? '');
  const [rrule, setRrule] = useState<string | null>(initialData?.recurrence_rule ?? null);
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
    formState: { errors, isSubmitting },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      status: initialData?.status ?? 'unscheduled',
      scheduled_date: initialData?.scheduled_date ?? '',
      scheduled_start: initialData?.scheduled_start?.slice(0, 5) ?? '',
      scheduled_end: initialData?.scheduled_end?.slice(0, 5) ?? '',
      notes: initialData?.notes ?? '',
    },
  });

  async function onSubmit(data: JobFormData) {
    setServerError(null);

    const payload = {
      title: data.title,
      status: data.status,
      company_id: companyId,
      client_id: clientId || null,
      crew_id: crewId || null,
      scheduled_date: data.scheduled_date || null,
      scheduled_start: data.scheduled_start || null,
      scheduled_end: data.scheduled_end || null,
      notes: data.notes || null,
      is_recurring: !!rrule,
      recurrence_rule: rrule ?? null,
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
          <Label htmlFor="notes">Notes</Label>
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
          placeholder="Access instructions, special requirements…"
          {...register('notes')}
        />
      </div>

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
