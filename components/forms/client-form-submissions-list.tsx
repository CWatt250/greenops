'use client';

import { useEffect, useState } from 'react';
import { Loader2, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ResponseValue } from './response-value';

interface SubmissionRow {
  id: string;
  submitted_at: string;
  responses: Record<string, unknown>;
  template?: { name: string; trigger: string } | null;
  submitter?: { full_name: string | null } | null;
  job?: { id: string; title: string } | null;
}

export function ClientFormSubmissionsList({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('form_submissions')
        .select(`
          id, submitted_at, responses,
          template:form_templates(name, trigger),
          submitter:profiles!form_submissions_submitted_by_fkey(full_name),
          job:jobs(id, title)
        `)
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false });
      if (!cancelled) {
        setRows((data ?? []) as unknown as SubmissionRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <ClipboardList className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-semibold">No forms submitted yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Crews can submit forms from a job's detail page; the history is
          aggregated here per client.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((s) => (
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
            by {s.submitter?.full_name ?? '—'}
            {s.job && (
              <> · job: <span className="text-foreground font-medium">{s.job.title}</span></>
            )}
          </p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View responses ({Object.keys(s.responses).length})
            </summary>
            <ul className="mt-1.5 space-y-0.5 pl-3 border-l-2 border-muted">
              {Object.entries(s.responses).map(([k, v]) => (
                <li key={k}>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {k}:
                  </span>{' '}
                  <span className="text-xs">
                    <ResponseValue value={v} />
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
