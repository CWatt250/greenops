'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Loader2, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowFormsWorks } from '@/components/help/how-page-works';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormBuilder } from '@/components/forms/form-builder';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FormTemplate, FormTrigger } from '@/types';

const TRIGGER_LABELS: Record<FormTrigger, string> = {
  pre_job: 'Pre-job',
  post_job: 'Post-job',
  on_demand: 'On-demand',
  customer_signoff: 'Customer sign-off',
};

const TRIGGER_COLORS: Record<FormTrigger, string> = {
  pre_job: 'bg-blue-100 text-blue-700',
  post_job: 'bg-green-100 text-green-700',
  on_demand: 'bg-gray-100 text-gray-700',
  customer_signoff: 'bg-amber-100 text-amber-700',
};

interface SubmissionRow {
  id: string;
  submitted_at: string;
  responses: Record<string, unknown>;
  template?: { id: string; name: string; trigger: FormTrigger } | null;
  submitter?: { full_name: string | null } | null;
  job?: { id: string; title: string } | null;
  client?: { id: string; name: string } | null;
}

export default function FormsPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FormTemplate | null>(null);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const cid = (profile as { company_id?: string } | null)?.company_id ?? null;
    setCompanyId(cid);
    if (!cid) { setLoading(false); return; }

    const [templatesRes, submissionsRes] = await Promise.all([
      supabase
        .from('form_templates')
        .select('*')
        .eq('company_id', cid)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('form_submissions')
        .select(`
          id, submitted_at, responses, template_id,
          template:form_templates(id, name, trigger),
          submitter:profiles!form_submissions_submitted_by_fkey(full_name),
          job:jobs(id, title),
          client:clients(id, name)
        `)
        .eq('company_id', cid)
        .order('submitted_at', { ascending: false })
        .limit(50),
    ]);

    const allTemplates = (templatesRes.data ?? []) as FormTemplate[];
    setTemplates(allTemplates);

    const allSubmissions = (submissionsRes.data ?? []) as unknown as Array<SubmissionRow & { template_id: string | null }>;
    setSubmissions(allSubmissions);

    // Count submissions per template across the whole submissions table.
    const counts: Record<string, number> = {};
    for (const s of allSubmissions) {
      if (s.template_id) {
        counts[s.template_id] = (counts[s.template_id] ?? 0) + 1;
      }
    }
    setSubmissionCounts(counts);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(t: FormTemplate) {
    const { error } = await supabase
      .from('form_templates')
      .update({ is_active: false })
      .eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    toast.success('Form archived.');
  }

  return (
    <div>
      <PageHeader
        title="Forms"
        eyebrow="Build it once, fill it forever"
        description="Custom checklists, inspections, waivers, and sign-offs."
      >
        <HowFormsWorks />
        {!editing && !creating && (
          <Button
            onClick={() => setCreating(true)}
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create Form
          </Button>
        )}
      </PageHeader>

      <PageIntro
        id="forms"
        title="Custom field forms"
        description="Build inspections, sign-offs, waivers, and chemical-application logs that crews fill out from the job page."
        steps={[
          'Create Form, add fields (text, number, dropdown, signature, photo).',
          'Once published, attach the form to any job from the Forms section on the job page.',
          'Submitted forms become PDFs you can attach to invoices or share with clients.',
        ]}
      />

      {(creating || editing) && companyId && (
        <div className="rounded-xl border bg-card p-4 mb-6">
          <FormBuilder
            template={editing ?? undefined}
            companyId={companyId}
            onSaved={(t) => {
              setCreating(false);
              setEditing(null);
              setTemplates((prev) => {
                const idx = prev.findIndex((x) => x.id === t.id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = t;
                  return next;
                }
                return [t, ...prev];
              });
            }}
            onCancel={() => { setCreating(false); setEditing(null); }}
          />
        </div>
      )}

      {/* TEMPLATES */}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Form templates
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 && !creating ? (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center">
            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-semibold mb-1">No forms yet</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Build forms for pre-job inspections, post-job quality checks,
              damage waivers, or anything else your crews fill out repeatedly.
            </p>
            <Button
              onClick={() => setCreating(true)}
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Build your first form
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => {
              const subCount = submissionCounts[t.id] ?? 0;
              return (
                <div key={t.id} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-bold leading-tight">{t.name}</p>
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0',
                      TRIGGER_COLORS[t.trigger]
                    )}>
                      {TRIGGER_LABELS[t.trigger]}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                    <span>{t.fields.length} field{t.fields.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{subCount} submission{subCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-auto pt-2 border-t -mx-4 px-4 -mb-2 pb-1">
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 gap-1.5 text-xs h-11"
                      onClick={() => setEditing(t)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 gap-1.5 text-xs h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(t)}
                    >
                      <Trash2 className="h-3 w-3" /> Archive
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RECENT SUBMISSIONS */}
      {submissions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Recent submissions
          </h2>
          <ul className="divide-y rounded-xl border bg-card overflow-hidden">
            {submissions.map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold truncate">
                        {s.template?.name ?? 'Form'}
                      </p>
                      {s.template?.trigger && (
                        <span className={cn(
                          'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                          TRIGGER_COLORS[s.template.trigger]
                        )}>
                          {TRIGGER_LABELS[s.template.trigger]}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      by {s.submitter?.full_name ?? '—'}
                      {s.client && (
                        <>
                          {' · '}
                          <Link
                            href={`/dashboard/clients/${s.client.id}`}
                            className="hover:text-foreground underline-offset-2 hover:underline"
                          >
                            {s.client.name}
                          </Link>
                        </>
                      )}
                      {s.job && (
                        <>
                          {' · '}
                          <Link
                            href={`/dashboard/jobs/${s.job.id}`}
                            className="hover:text-foreground underline-offset-2 hover:underline"
                          >
                            {s.job.title}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(s.submitted_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Archive "${confirmDelete?.name ?? ''}"?`}
        description="The form is removed from the picker. Existing submissions stay intact and visible."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}
