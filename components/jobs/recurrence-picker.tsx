'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  buildRrule, rruleToText,
  type RecurFreq, type WeekdayStr,
  freqFromRrule, daysFromRrule,
} from '@/lib/rrule-helpers';

const DAYS: { key: WeekdayStr; label: string }[] = [
  { key: 'MO', label: 'M' },
  { key: 'TU', label: 'T' },
  { key: 'WE', label: 'W' },
  { key: 'TH', label: 'T' },
  { key: 'FR', label: 'F' },
  { key: 'SA', label: 'S' },
  { key: 'SU', label: 'S' },
];

interface RecurrencePickerProps {
  value: string | null;
  onChange: (rrule: string | null) => void;
}

export function RecurrencePicker({ value, onChange }: RecurrencePickerProps) {
  const [enabled, setEnabled] = useState(!!value);
  const [freq, setFreq] = useState<RecurFreq>(value ? freqFromRrule(value) : 'weekly');
  const [days, setDays] = useState<WeekdayStr[]>(value ? daysFromRrule(value) : ['MO']);

  // Sync outward whenever enabled/freq/days changes
  useEffect(() => {
    if (!enabled) {
      onChange(null);
      return;
    }
    const showDays = freq === 'weekly' || freq === 'biweekly';
    onChange(buildRrule(freq, showDays ? days : []));
  }, [enabled, freq, days]);

  function toggleDay(day: WeekdayStr) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  const showDays = freq === 'weekly' || freq === 'biweekly';
  const preview = enabled ? rruleToText(buildRrule(freq, showDays ? days : [])) : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Switch
          id="recurring"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="recurring" className="cursor-pointer">Recurring job</Label>
      </div>

      {enabled && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Repeats</Label>
            <Select value={freq} onValueChange={(v) => setFreq(v as RecurFreq)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showDays && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">On</Label>
              <div className="flex gap-1.5">
                {DAYS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={cn(
                      'h-8 w-8 rounded-full text-xs font-semibold transition-colors',
                      days.includes(key)
                        ? 'text-white'
                        : 'bg-background border text-muted-foreground hover:border-primary/40'
                    )}
                    style={
                      days.includes(key)
                        ? { backgroundColor: 'var(--color-brand-green-raw)' }
                        : {}
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {preview && (
            <p className="text-xs text-muted-foreground capitalize">
              Repeats {preview}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
