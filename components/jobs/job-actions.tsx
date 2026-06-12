'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Trash2, XCircle, Copy } from 'lucide-react';
import type { JobStatus } from '@/types';

interface Props {
  jobId: string;
  jobTitle: string;
  status: JobStatus;
  clientId: string | null;
  crewId: string | null;
}

export function JobActions({ jobId, jobTitle, status, clientId, crewId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [confirm, setConfirm] = useState<'delete' | 'cancel' | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const cancellable = status !== 'cancelled' && status !== 'complete';

  async function handleDelete() {
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) { toast.error(error.message); return; }
    toast.success('Job deleted.');
    router.push('/dashboard/jobs');
    router.refresh();
  }

  async function handleCancel() {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId);
    if (error) { toast.error(error.message); return; }
    toast.success('Job cancelled.');
    router.refresh();
  }

  async function handleDuplicate() {
    setDuplicating(true);

    // Pull the services spine
    const { data: items } = await supabase
      .from('job_services')
      .select('service_id, custom_name, quantity, duration_minutes, price, notes, sort_order')
      .eq('job_id', jobId);

    // Get the source job's company_id
    const { data: src } = await supabase
      .from('jobs')
      .select('company_id, title')
      .eq('id', jobId)
      .single();

    if (!src) { setDuplicating(false); toast.error('Source job not found.'); return; }

    const { data: newJob, error: insertErr } = await supabase
      .from('jobs')
      .insert({
        company_id: src.company_id,
        title: `${src.title} (copy)`,
        status: 'unscheduled',
        client_id: clientId,
        crew_id: crewId,
      })
      .select('id')
      .single();

    if (insertErr || !newJob) {
      setDuplicating(false);
      toast.error(insertErr?.message ?? 'Failed to duplicate job.');
      return;
    }

    if (items && items.length > 0) {
      await supabase.from('job_services').insert(
        items.map((i) => ({
          ...i,
          job_id: newJob.id,
          // Pre-047 rows may still carry null — never copy it forward.
          duration_minutes: i.duration_minutes ?? 30,
        }))
      );
    }

    setDuplicating(false);
    toast.success('Job duplicated.');
    router.push(`/dashboard/jobs/${newJob.id}`);
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDuplicate}
          disabled={duplicating}
          className="gap-1.5"
          title="Duplicate job"
        >
          <Copy className="h-3.5 w-3.5" />
          {duplicating ? 'Copying…' : 'Duplicate'}
        </Button>
        {cancellable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm('cancel')}
            className="gap-1.5"
            title="Cancel job"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm('delete')}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          title="Delete job"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={`Cancel "${jobTitle}"?`}
        description="The job stays in your records but won't be worked. Recurring instances are not affected."
        confirmLabel="Cancel job"
        cancelLabel="Keep job"
        destructive
        onConfirm={handleCancel}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={`Delete "${jobTitle}"?`}
        description="Permanently removes the job, its line items, route stops, and activity log. This cannot be undone — cancel the job instead if you want it for reporting."
        confirmLabel="Delete job"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
