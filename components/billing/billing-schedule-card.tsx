'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CalendarDays, Pencil } from 'lucide-react';
import type { BillingSchedule } from '@/types';
import { rruleToText } from '@/lib/rrule-helpers';

interface Props {
  schedule: BillingSchedule;
  onUpdate: (updated: BillingSchedule) => void;
}

export function BillingScheduleCard({ schedule, onUpdate }: Props) {
  const supabase = createClient();
  const [toggling, setToggling] = useState(false);
  const [editingTax, setEditingTax] = useState(false);
  // Shown/edited as percent; stored as decimal (0.085 = 8.5%).
  const [taxPct, setTaxPct] = useState(() => String((schedule.tax_rate ?? 0) * 100));
  const [savingTax, setSavingTax] = useState(false);

  async function handleToggle(active: boolean) {
    setToggling(true);
    const { data, error } = await supabase
      .from('billing_schedules')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      onUpdate(data as BillingSchedule);
    }
    setToggling(false);
  }

  async function handleTaxSave() {
    const pct = parseFloat(taxPct);
    if (Number.isNaN(pct) || pct < 0 || pct > 99) {
      toast.error('Tax rate must be between 0 and 99%');
      return;
    }
    setSavingTax(true);
    const { data, error } = await supabase
      .from('billing_schedules')
      .update({ tax_rate: pct / 100, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      onUpdate(data as BillingSchedule);
      setTaxPct(String(((data as BillingSchedule).tax_rate ?? 0) * 100));
      toast.success('Tax rate updated');
      setEditingTax(false);
    }
    setSavingTax(false);
  }

  const ruleText = (() => {
    try { return rruleToText(schedule.recurrence_rule); } catch { return schedule.recurrence_rule; }
  })();

  const taxLabel = `${((schedule.tax_rate ?? 0) * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

  return (
    <div className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
        >
          <CalendarDays className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {schedule.client?.name ?? 'Unknown Client'}
          </p>
          <p className="text-xs text-muted-foreground capitalize">{ruleText}</p>
          {schedule.next_invoice_date && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Next: {new Date(`${schedule.next_invoice_date}T12:00`).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
          {editingTax ? (
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                max="99"
                step="0.01"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTaxSave(); }}
                className="h-7 w-20 text-xs"
                autoFocus
              />
              <span className="text-xs text-muted-foreground">%</span>
              <button
                type="button"
                onClick={handleTaxSave}
                disabled={savingTax}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTax(false);
                  setTaxPct(String((schedule.tax_rate ?? 0) * 100));
                }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTax(true)}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Tax: {taxLabel}
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {schedule.auto_send && (
            <p className="text-xs text-blue-600 mt-0.5">Auto-send enabled</p>
          )}
        </div>
      </div>
      <Switch
        checked={schedule.is_active}
        onCheckedChange={handleToggle}
        disabled={toggling}
      />
    </div>
  );
}
