'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { CalendarDays } from 'lucide-react';
import type { BillingSchedule } from '@/types';
import { rruleToText } from '@/lib/rrule-helpers';

interface Props {
  schedule: BillingSchedule;
  onUpdate: (updated: BillingSchedule) => void;
}

export function BillingScheduleCard({ schedule, onUpdate }: Props) {
  const supabase = createClient();
  const [toggling, setToggling] = useState(false);

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

  const ruleText = (() => {
    try { return rruleToText(schedule.recurrence_rule); } catch { return schedule.recurrence_rule; }
  })();

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
