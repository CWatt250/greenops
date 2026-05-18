'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Trash2, ArrowUp, ArrowDown, Loader2, Save,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type {
  FormFieldDef, FormFieldType, FormTemplate, FormTrigger,
} from '@/types';

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  yes_no: 'Yes / No',
  radio: 'Multiple choice',
  multi_select: 'Multi-select',
  date: 'Date',
  rating: 'Rating (1-5)',
  signature: 'Signature',
};

const TRIGGER_LABELS: Record<FormTrigger, string> = {
  pre_job: 'Pre-job',
  post_job: 'Post-job',
  on_demand: 'On-demand',
  customer_signoff: 'Customer sign-off',
};

interface Props {
  /** When provided, the form is in "edit" mode for that template. */
  template?: FormTemplate;
  companyId: string;
  /** Called after a successful save with the saved template. */
  onSaved: (template: FormTemplate) => void;
  onCancel: () => void;
}

function makeFieldId() {
  return `f_${Math.random().toString(36).slice(2, 8)}`;
}

export function FormBuilder({ template, companyId, onSaved, onCancel }: Props) {
  const supabase = createClient();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [trigger, setTrigger] = useState<FormTrigger>(template?.trigger ?? 'on_demand');
  const [fields, setFields] = useState<FormFieldDef[]>(template?.fields ?? []);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields((prev) => [
      ...prev,
      { id: makeFieldId(), type: 'text', label: '', required: false },
    ]);
  }

  function updateField(id: string, patch: Partial<FormFieldDef>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function moveField(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function save() {
    if (!name.trim()) { toast.error('Form name is required.'); return; }
    if (fields.length === 0) { toast.error('Add at least one field.'); return; }
    if (fields.some((f) => !f.label.trim())) {
      toast.error('Every field needs a label.');
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      trigger,
      fields,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (template) {
      const { data, error } = await supabase
        .from('form_templates')
        .update(payload)
        .eq('id', template.id)
        .select('*')
        .single();
      setSaving(false);
      if (error || !data) { toast.error(error?.message ?? 'Save failed.'); return; }
      toast.success('Form updated.');
      onSaved(data as FormTemplate);
    } else {
      const { data, error } = await supabase
        .from('form_templates')
        .insert(payload)
        .select('*')
        .single();
      setSaving(false);
      if (error || !data) { toast.error(error?.message ?? 'Save failed.'); return; }
      toast.success('Form created.');
      onSaved(data as FormTemplate);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Form name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pre-Job Property Inspection"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">When does this form fire?</Label>
          <Select value={trigger} onValueChange={(v) => setTrigger((v ?? 'on_demand') as FormTrigger)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TRIGGER_LABELS) as FormTrigger[]).map((t) => (
                <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description (optional)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="What is this form for?"
        />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold">Fields ({fields.length})</p>
          <Button variant="outline" size="sm" onClick={addField} className="gap-1.5 h-11">
            <Plus className="h-3.5 w-3.5" /> Add field
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-4 py-6 text-center">
            No fields yet — add one to start building.
          </p>
        ) : (
          <ul className="divide-y">
            {fields.map((f, idx) => (
              <li key={f.id} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 w-6 p-0"
                      disabled={idx === 0}
                      onClick={() => moveField(f.id, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 w-6 p-0"
                      disabled={idx === fields.length - 1}
                      onClick={() => moveField(f.id, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                    <Input
                      value={f.label}
                      onChange={(e) => updateField(f.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="h-11 text-sm font-medium"
                    />
                    <Select
                      value={f.type}
                      onValueChange={(v) => updateField(f.id, { type: (v ?? 'text') as FormFieldType })}
                    >
                      <SelectTrigger className="h-11 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_TYPE_LABELS) as FormFieldType[]).map((t) => (
                          <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="h-11 w-11 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeField(f.id)}
                    aria-label="Remove field"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {(f.type === 'radio' || f.type === 'multi_select') && (
                  <div className="pl-9">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Choices (one per line)
                    </Label>
                    <textarea
                      value={(f.choices ?? []).join('\n')}
                      onChange={(e) => updateField(f.id, {
                        choices: e.target.value.split('\n').map((c) => c.trim()).filter(Boolean),
                      })}
                      rows={3}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                <div className="pl-9 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    Required to submit
                  </span>
                  <Switch
                    checked={!!f.required}
                    onCheckedChange={(v) => updateField(f.id, { required: v })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={save}
          disabled={saving}
          className="gap-1.5"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {template ? 'Save changes' : 'Create form'}
        </Button>
      </div>
    </div>
  );
}
