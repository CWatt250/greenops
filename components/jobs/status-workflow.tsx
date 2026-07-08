'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { AlertTriangle, CheckCircle2, Play, Calendar, RotateCcw, FileText } from 'lucide-react';
import type { JobStatus } from '@/types';

interface Transition {
  next: JobStatus;
  label: string;
  icon: React.ReactNode;
  style?: React.CSSProperties;
  variant?: 'default' | 'outline' | 'destructive';
}

const TRANSITIONS: Record<JobStatus, Transition[]> = {
  unscheduled: [
    {
      next: 'scheduled',
      label: 'Mark Scheduled',
      icon: <Calendar className="h-4 w-4" />,
      style: { backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' },
    },
  ],
  scheduled: [
    {
      next: 'in_progress',
      label: 'Start Job',
      icon: <Play className="h-4 w-4" />,
      style: { backgroundColor: '#3B82F6', color: '#fff' },
    },
  ],
  en_route: [
    {
      next: 'in_progress',
      label: 'Start Job',
      icon: <Play className="h-4 w-4" />,
      style: { backgroundColor: '#3B82F6', color: '#fff' },
    },
  ],
  in_progress: [
    {
      next: 'complete',
      label: 'Mark Complete',
      icon: <CheckCircle2 className="h-4 w-4" />,
      style: { backgroundColor: '#22C55E', color: '#fff' },
    },
  ],
  complete: [],
  cancelled: [],
  issue: [
    {
      next: 'scheduled',
      label: 'Reopen',
      icon: <RotateCcw className="h-4 w-4" />,
      variant: 'outline',
    },
    {
      next: 'complete',
      label: 'Resolve & Complete',
      icon: <CheckCircle2 className="h-4 w-4" />,
      style: { backgroundColor: '#22C55E', color: '#fff' },
    },
  ],
};

const CAN_FLAG: JobStatus[] = ['unscheduled', 'scheduled', 'en_route', 'in_progress'];

interface StatusWorkflowProps {
  jobId: string;
  status: JobStatus;
  onStatusChange?: (newStatus: JobStatus) => void;
}

export function StatusWorkflow({ jobId, status, onStatusChange }: StatusWorkflowProps) {
  const supabase = createClient();
  const [current, setCurrent] = useState(status);
  const [loading, setLoading] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  async function transition(next: JobStatus) {
    setLoading(true);
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      status: next,
      updated_at: now,
    };

    if (next === 'in_progress') patch.actual_start = now;
    if (next === 'complete') patch.actual_end = now;

    const { error } = await supabase
      .from('jobs')
      .update(patch)
      .eq('id', jobId);

    if (!error) {
      // Log to activity_log
      const ctx = await getCompanyContext(supabase);
      if (ctx) {
        await supabase.from('activity_log').insert({
          company_id: ctx.companyId,
          entity_type: 'job',
          entity_id: jobId,
          action: `status_changed_to_${next}`,
          actor_id: ctx.userId,
          metadata: { from: current, to: next },
        });
      }

      setCurrent(next);
      onStatusChange?.(next);
      if (next === 'complete') {
        setJustCompleted(true);
        void supabase.rpc('refresh_analytics').then(() => {});
      }
    }
    setLoading(false);
  }

  async function flagIssue() {
    await transition('issue');
  }

  const transitions = TRANSITIONS[current] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={current} type="job" className="text-sm px-3 py-1" />

      {transitions.map((t) => (
        <Button
          key={t.next}
          size="sm"
          variant={t.variant ?? 'default'}
          disabled={loading}
          onClick={() => transition(t.next)}
          style={t.style}
          className="gap-1.5"
        >
          {t.icon}
          {t.label}
        </Button>
      ))}

      {CAN_FLAG.includes(current) && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={flagIssue}
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <AlertTriangle className="h-4 w-4" />
          Flag Issue
        </Button>
      )}

      {justCompleted && (
        <div className="w-full mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-700 font-medium flex-1">Job complete!</span>
          <Link
            href={`/dashboard/invoices/new?job_id=${jobId}`}
            className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 underline underline-offset-2"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Invoice
          </Link>
          <button
            onClick={() => setJustCompleted(false)}
            className="text-xs text-green-600 hover:text-green-800 ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
