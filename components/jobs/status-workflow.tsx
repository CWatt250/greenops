'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { AlertTriangle, CheckCircle2, Play, Calendar, RotateCcw } from 'lucide-react';
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

const CAN_FLAG: JobStatus[] = ['unscheduled', 'scheduled', 'in_progress'];

interface StatusWorkflowProps {
  jobId: string;
  status: JobStatus;
  onStatusChange?: (newStatus: JobStatus) => void;
}

export function StatusWorkflow({ jobId, status, onStatusChange }: StatusWorkflowProps) {
  const supabase = createClient();
  const [current, setCurrent] = useState(status);
  const [loading, setLoading] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .single();

        if (profile?.company_id) {
          await supabase.from('activity_log').insert({
            company_id: profile.company_id,
            entity_type: 'job',
            entity_id: jobId,
            action: `status_changed_to_${next}`,
            actor_id: user.id,
            metadata: { from: current, to: next },
          });
        }
      }

      setCurrent(next);
      onStatusChange?.(next);
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
    </div>
  );
}
