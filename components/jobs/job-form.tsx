'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClientCombobox } from '@/components/clients/client-combobox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Job, Client } from '@/types';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  status: z.enum(['unscheduled', 'scheduled', 'in_progress', 'complete', 'cancelled', 'issue']),
  scheduled_date: z.string().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  notes: z.string().optional(),
  client_id: z.string().optional(),
  crew_id: z.string().optional(),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormProps {
  initialData?: Partial<Job>;
  companyId: string;
}

export function JobForm({ initialData, companyId }: JobFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(initialData?.client_id ?? '');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      status: initialData?.status ?? 'unscheduled',
      scheduled_date: initialData?.scheduled_date ?? '',
      scheduled_start: initialData?.scheduled_start ?? '',
      scheduled_end: initialData?.scheduled_end ?? '',
      notes: initialData?.notes ?? '',
      client_id: initialData?.client_id ?? '',
    },
  });

  async function onSubmit(data: JobFormData) {
    setServerError(null);
    const payload = {
      ...data,
      company_id: companyId,
      client_id: selectedClientId || null,
      scheduled_date: data.scheduled_date || null,
      scheduled_start: data.scheduled_start || null,
      scheduled_end: data.scheduled_end || null,
    };

    let result;
    if (initialData?.id) {
      result = await supabase.from('jobs').update(payload).eq('id', initialData.id).select().single();
    } else {
      result = await supabase.from('jobs').insert(payload).select().single();
    }

    if (result.error) {
      setServerError(result.error.message);
      return;
    }

    router.push(`/jobs/${result.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">Job Title *</Label>
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Client</Label>
        <ClientCombobox
          value={selectedClientId}
          onChange={(id) => {
            setSelectedClientId(id);
            setValue('client_id', id);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            defaultValue={initialData?.status ?? 'unscheduled'}
            onValueChange={(v) => setValue('status', v as JobFormData['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
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

        <div className="space-y-2">
          <Label htmlFor="scheduled_date">Scheduled Date</Label>
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

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" {...register('notes')} />
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
