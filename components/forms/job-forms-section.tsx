'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormRunner } from './form-runner';
import { createClient } from '@/lib/supabase/client';
import type { FormTemplate, FormSubmission, FormTrigger } from '@/types';

interface SubmissionRow extends FormSubmission {
  template?: { name: string } | null;
  submitter?: { full_name: string | null } | null;
}

interface Props {
  jobId: string;
  clientId: string | null;
  companyId: string;
  userId: string;
}

const TRIGGER_LABELS: Record<FormTrigger, string> = {
  pre_job: 'Pre-job',
  post_job: 'Post-job',
  on_demand: 'On-demand',
  customer_signoff: 'Customer sign-off',
};

export function JobFormsSection({ jobId, clientId, companyId, userId }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<FormTemplate | null>(null);

  async function load() {
    setLoading(true);
    const [templatesRes, submissionsRes] = await Promise.all([
      supabase
        .from('form_templates')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(name),
          submitter:profiles!form_submissions_submitted_by_fkey(full_name)
        `)
        .eq('job_id', jobId)
        .order('submitted_at', { ascending: false }),
    ]);
    setTemplates((templatesRes.data ?? []) as FormTemplate[]);
    setSubmissions((submissionsRes.data ?? []) as unknown as SubmissionRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quick-launch row of available templates */}
      {templates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Available forms
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                onClick={() => setRunning(t)}
                className="gap-1.5"
              >
                <Plus className="h-3 w-3" />
                <span>{t.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {TRIGGER_LABELS[t.trigger]}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && submissions.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <ClipboardList className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-semibold">No forms yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Build templates in <strong>Settings → Forms & Checklists</strong>.
          </p>
        </div>
      )}

      {/* Submissions */}
      {submissions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
            Submitted
          </p>
          <ul className="space-y-1.5">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-lg border bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-sm">
                    {s.template?.name ?? 'Form'}
                  </p>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(s.submitted_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  by {s.submitter?.full_name ?? '—'} ·{' '}
                  {Object.keys(s.responses).length} response{Object.keys(s.responses).length === 1 ? '' : 's'}
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View responses
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 pl-3 border-l-2 border-muted">
                    {Object.entries(s.responses).map(([k, v]) => (
                      <li key={k}>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {k}:
                        </span>{' '}
                        <span className="text-xs">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {running && (
        <FormRunner
          open={!!running}
          onOpenChange={(o) => { if (!o) setRunning(null); }}
          template={running}
          companyId={companyId}
          userId={userId}
          jobId={jobId}
          clientId={clientId}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
