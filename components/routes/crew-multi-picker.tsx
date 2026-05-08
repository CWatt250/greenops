'use client';

import { Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Crew } from '@/types';

interface CrewMultiPickerProps {
  crews: Crew[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function CrewMultiPicker({
  crews,
  selectedIds,
  onChange,
  disabled,
}: CrewMultiPickerProps) {
  const allSelected = crews.length > 0 && selectedIds.length === crews.length;

  function toggle(id: string) {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  }

  function toggleAll() {
    if (disabled) return;
    onChange(allSelected ? [] : crews.map((c) => c.id));
  }

  if (crews.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No active crews. Add one in <span className="font-medium">Crews</span>.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors',
            allSelected
              ? 'text-[var(--orange)]'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="h-3 w-3" />
          {allSelected ? 'All selected' : 'Select all crews'}
        </button>
        {selectedIds.length > 1 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            multi-crew mode
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {crews.map((crew) => {
          const active = selectedIds.includes(crew.id);
          return (
            <button
              key={crew.id}
              type="button"
              onClick={() => toggle(crew.id)}
              disabled={disabled}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all',
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-background text-foreground border-border hover:border-foreground/40',
                disabled && 'opacity-60 cursor-not-allowed'
              )}
              style={
                active
                  ? { backgroundColor: crew.color }
                  : undefined
              }
              aria-pressed={active}
            >
              <span
                className={cn(
                  'inline-flex h-3 w-3 items-center justify-center rounded-full shrink-0 transition-colors',
                  active
                    ? 'bg-white/20'
                    : ''
                )}
                style={
                  active
                    ? { color: '#fff' }
                    : { backgroundColor: crew.color }
                }
              >
                {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="truncate max-w-[120px]">{crew.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
