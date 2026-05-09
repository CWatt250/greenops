'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormBuilder } from '@/components/forms/form-builder';
import { toast } from 'sonner';
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

export default function FormsSettingsPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
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
    const { data } = await supabase
      .from('form_templates')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setTemplates((data ?? []) as FormTemplate[]);
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
    <div className="max-w-4xl">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Settings
      </Link>
      <PageHeader title="Forms & Checklists" description="Custom forms for pre-job, post-job, and customer sign-off.">
        {!editing && !creating && (
          <Button
            onClick={() => setCreating(true)}
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New form
          </Button>
        )}
      </PageHeader>

      {(creating || editing) && companyId && (
        <div className="rounded-xl border bg-card p-4 mb-4">
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <p className="text-sm font-semibold mb-1">No forms yet</p>
          <p className="text-xs text-muted-foreground mb-4">
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
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{t.name}</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TRIGGER_COLORS[t.trigger]}`}>
                    {TRIGGER_LABELS[t.trigger]}
                  </span>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t.fields.length} field{t.fields.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditing(t)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(t)}
                  title="Archive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Archive "${confirmDelete?.name ?? ''}"?`}
        description="The form is removed from the picker. Existing submissions stay intact."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}
