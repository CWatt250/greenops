'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { NoteTemplate } from '@/types';

interface Props {
  companyId: string;
}

export function NoteTemplatesManager({ companyId }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NoteTemplate | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('note_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('label');
    setTemplates((data ?? []) as NoteTemplate[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startNew() {
    setEditingId('new');
    setDraftLabel('');
    setDraftBody('');
  }

  function startEdit(t: NoteTemplate) {
    setEditingId(t.id);
    setDraftLabel(t.label);
    setDraftBody(t.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftLabel('');
    setDraftBody('');
  }

  async function save() {
    if (!draftLabel.trim() || !draftBody.trim()) {
      toast.error('Both label and body are required.');
      return;
    }
    setSaving(true);
    if (editingId === 'new') {
      const { data, error } = await supabase
        .from('note_templates')
        .insert({
          company_id: companyId,
          label: draftLabel.trim(),
          body: draftBody.trim(),
        })
        .select('*')
        .single();
      setSaving(false);
      if (error || !data) { toast.error(error?.message ?? 'Failed.'); return; }
      setTemplates((prev) => [...prev, data as NoteTemplate].sort((a, b) => a.label.localeCompare(b.label)));
      toast.success('Template saved.');
    } else if (editingId) {
      const { error } = await supabase
        .from('note_templates')
        .update({ label: draftLabel.trim(), body: draftBody.trim() })
        .eq('id', editingId);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      setTemplates((prev) => prev.map((t) => (
        t.id === editingId
          ? { ...t, label: draftLabel.trim(), body: draftBody.trim() }
          : t
      )).sort((a, b) => a.label.localeCompare(b.label)));
      toast.success('Template updated.');
    }
    cancelEdit();
  }

  async function handleDelete(t: NoteTemplate) {
    const { error } = await supabase.from('note_templates').delete().eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    toast.success('Template removed.');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Reusable note snippets — apply to a job in one click.
        </p>
        {editingId === null && (
          <Button
            variant="outline"
            size="sm"
            onClick={startNew}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New template
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading…</div>
      ) : templates.length === 0 && editingId === null ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No templates yet. Click &ldquo;New template&rdquo; to add one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-lg border bg-card p-3 space-y-1.5">
              {editingId === t.id ? (
                <DraftEditor
                  label={draftLabel}
                  body={draftBody}
                  onLabelChange={setDraftLabel}
                  onBodyChange={setDraftBody}
                  saving={saving}
                  onCancel={cancelEdit}
                  onSave={save}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.label}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => startEdit(t)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDelete(t)}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</p>
                </>
              )}
            </li>
          ))}
          {editingId === 'new' && (
            <li className="rounded-lg border bg-card p-3">
              <DraftEditor
                label={draftLabel}
                body={draftBody}
                onLabelChange={setDraftLabel}
                onBodyChange={setDraftBody}
                saving={saving}
                onCancel={cancelEdit}
                onSave={save}
              />
            </li>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.label ?? ''}"?`}
        description="The template is removed from the catalog. Existing job notes that used it are unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await handleDelete(confirmDelete);
        }}
      />
    </div>
  );
}

function DraftEditor({
  label, body, onLabelChange, onBodyChange, saving, onCancel, onSave,
}: {
  label: string;
  body: string;
  onLabelChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label</Label>
        <Input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="e.g. Standard gate-code instructions"
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body</Label>
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={3}
          placeholder="Gate code 1234, dog in backyard, mow around toy area."
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="gap-1.5"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save template
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}
