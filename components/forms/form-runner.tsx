'use client';

import { useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FormTemplate, FormFieldDef } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: FormTemplate;
  companyId: string;
  userId: string;
  jobId?: string | null;
  clientId?: string | null;
  onSubmitted?: () => void;
}

export function FormRunner({
  open, onOpenChange, template, companyId, userId, jobId, clientId, onSubmitted,
}: Props) {
  const supabase = createClient();
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  const requiredMissing = useMemo(() => {
    return template.fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = responses[f.id];
        if (v === undefined || v === null) return true;
        if (typeof v === 'string' && !v.trim()) return true;
        if (Array.isArray(v) && v.length === 0) return true;
        return false;
      });
  }, [responses, template.fields]);

  function setValue(id: string, v: unknown) {
    setResponses((prev) => ({ ...prev, [id]: v }));
  }

  async function submit() {
    if (requiredMissing.length > 0) {
      toast.error(`Required fields missing: ${requiredMissing.map((f) => f.label).join(', ')}`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('form_submissions').insert({
      company_id: companyId,
      template_id: template.id,
      job_id: jobId ?? null,
      client_id: clientId ?? null,
      submitted_by: userId,
      responses,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Form submitted.');
    setResponses({});
    onOpenChange(false);
    onSubmitted?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{template.name}</SheetTitle>
          {template.description && (
            <SheetDescription>{template.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-4">
          {template.fields.map((f) => (
            <FieldRunner
              key={f.id}
              field={f}
              value={responses[f.id]}
              onChange={(v) => setValue(f.id, v)}
            />
          ))}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full gap-1.5"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {submitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Submit
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldRunner({
  field, value, onChange,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {field.type === 'text' && (
        <Input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-9 text-sm"
        />
      )}
      {field.type === 'textarea' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      {field.type === 'number' && (
        <Input
          type="number"
          value={value === undefined ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
          placeholder={field.placeholder}
          className="h-9 text-sm tabular-nums"
        />
      )}
      {field.type === 'yes_no' && (
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {value === true ? 'Yes' : value === false ? 'No' : '—'}
          </span>
          <Switch
            checked={!!value}
            onCheckedChange={(v) => onChange(v)}
          />
        </div>
      )}
      {field.type === 'radio' && (
        <div className="space-y-1">
          {(field.choices ?? []).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                value === c
                  ? 'border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-deep)] font-semibold'
                  : 'bg-background hover:border-foreground/30'
              )}
            >
              <span className={cn(
                'h-3 w-3 rounded-full border-2 shrink-0',
                value === c ? 'border-[var(--orange)] bg-[var(--orange)]' : 'border-muted-foreground'
              )} />
              {c}
            </button>
          ))}
        </div>
      )}
      {field.type === 'multi_select' && (
        <div className="space-y-1">
          {(field.choices ?? []).map((c) => {
            const arr = (value as string[] | undefined) ?? [];
            const checked = arr.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  const next = checked ? arr.filter((x) => x !== c) : [...arr, c];
                  onChange(next);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  checked
                    ? 'border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-deep)]'
                    : 'bg-background hover:border-foreground/30'
                )}
              >
                <span className={cn(
                  'h-3 w-3 rounded border-2 shrink-0',
                  checked ? 'border-[var(--orange)] bg-[var(--orange)]' : 'border-muted-foreground'
                )} />
                {c}
              </button>
            );
          })}
        </div>
      )}
      {field.type === 'date' && (
        <Input
          type="datetime-local"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}
      {field.type === 'rating' && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              className="p-1"
            >
              <Star
                className="h-6 w-6"
                fill={typeof value === 'number' && value >= n ? 'var(--orange)' : 'transparent'}
                strokeWidth={1.5}
                style={{ color: 'var(--orange)' }}
              />
            </button>
          ))}
        </div>
      )}
      {field.type === 'signature' && (
        <div className="rounded-md border-dashed border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          ✍️ Signature capture coming soon — for now, type the signer's name
          to acknowledge.
          <Input
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type signer's full name"
            className="h-9 text-sm mt-2"
          />
        </div>
      )}
    </div>
  );
}
