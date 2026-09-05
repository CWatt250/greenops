'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { LayoutTemplate, Pencil, Trash2, Loader2, Play, X } from 'lucide-react';
import { toast } from 'sonner';

export interface TemplateRow {
  id: string; name: string; title: string | null; notes: string | null; customer_notes: string | null;
  estimated_duration_minutes: number | null; time_window_start: string | null; time_window_end: string | null;
  default_line_items: Array<{ description?: string | null; quantity?: number; unit_price?: number }> | null;
  times_used: number | null; last_used_at: string | null; created_at: string;
  client: { id: string; name: string } | null; service: { name: string } | null; crew: { name: string } | null;
}

function money(items: TemplateRow['default_line_items']) {
  const total = (items ?? []).reduce((s, i) => s + Number(i.quantity ?? 1) * Number(i.unit_price ?? 0), 0);
  return total ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total) : null;
}

export function TemplatesManager({ initial }: { initial: TemplateRow[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState({ name: '', title: '', notes: '', customer_notes: '', duration: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<TemplateRow | null>(null);

  function startEdit(t: TemplateRow) {
    setEditing(t);
    setForm({ name: t.name, title: t.title ?? '', notes: t.notes ?? '', customer_notes: t.customer_notes ?? '', duration: t.estimated_duration_minutes ? String(t.estimated_duration_minutes) : '' });
  }

  async function save() {
    if (!editing) return;
    if (!form.name.trim()) { toast.error('Give the template a name.'); return; }
    setSaving(true);
    const patch = {
      name: form.name.trim(), title: form.title.trim() || null, notes: form.notes.trim() || null,
      customer_notes: form.customer_notes.trim() || null,
      estimated_duration_minutes: form.duration ? Math.max(0, parseInt(form.duration, 10) || 0) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('job_templates').update(patch).eq('id', editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((t) => (t.id === editing.id ? { ...t, ...patch } : t)));
    toast.success('Template updated.');
    setEditing(null);
  }

  async function remove(t: TemplateRow) {
    const { error } = await supabase.from('job_templates').delete().eq('id', t.id);
    setConfirm(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== t.id));
    toast.success('Template deleted.');
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={LayoutTemplate}
        title="No templates yet"
        description="Open any job and choose “Save as template”. It will show up here and under + New Job for that client."
      />
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => {
          const price = money(t.default_line_items);
          return (
            <li key={t.id} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.client ? <Link href={`/dashboard/clients/${t.client.id}`} className="hover:underline">{t.client.name}</Link> : 'No client'}{t.service ? ` · ${t.service.name}` : ''}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" aria-label="Edit template" onClick={() => startEdit(t)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                  <button type="button" aria-label="Delete template" onClick={() => setConfirm(t)} className="flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {t.estimated_duration_minutes ? <span>{t.estimated_duration_minutes} min</span> : null}
                {t.time_window_start && t.time_window_end ? <span>{t.time_window_start.slice(0, 5)}–{t.time_window_end.slice(0, 5)}</span> : null}
                {t.crew ? <span>{t.crew.name}</span> : null}
                {price ? <span className="font-medium text-foreground">{price}</span> : null}
                <span>used {t.times_used ?? 0}×</span>
              </div>
              {t.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.notes}</p>}
              <Link href={`/dashboard/jobs/new?template_id=${t.id}`} className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white" style={{ backgroundColor: 'var(--orange)' }}>
                <Play className="h-3.5 w-3.5" /> New job from template
              </Link>
            </li>
          );
        })}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Edit template">
          <div className="w-full max-w-lg rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Edit template</h2>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1"><Label htmlFor="tpl-name">Template name</Label><Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="tpl-title">Job title</Label><Input id="tpl-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to the template name" /></div>
              <div className="space-y-1"><Label htmlFor="tpl-duration">Estimated minutes</Label><Input id="tpl-duration" type="number" inputMode="numeric" min={0} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="w-40" /></div>
              <div className="space-y-1"><Label htmlFor="tpl-notes">Internal notes (crew only)</Label><Textarea id="tpl-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="tpl-cnotes">Customer-visible notes</Label><Textarea id="tpl-cnotes" rows={2} value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={`Delete “${confirm?.name}”?`}
        description="Jobs already created from it are untouched. This only removes the template."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirm) void remove(confirm); }}
      />
    </>
  );
}
