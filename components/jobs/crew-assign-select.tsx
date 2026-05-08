'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2, UserMinus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew } from '@/types';

interface CrewAssignSelectProps {
  jobId: string;
  currentCrewId: string | null;
  /** Display name of the currently-assigned crew, for the trigger label. */
  currentCrewName?: string | null;
  /** Display color of the currently-assigned crew. */
  currentCrewColor?: string | null;
  crews: Crew[];
  /** Called after successful save (receives the new crew_id, or null). */
  onAssigned?: (newCrewId: string | null) => void;
  /** Visual style: chip (default) or compact button. */
  variant?: 'chip' | 'button';
  className?: string;
}

export function CrewAssignSelect({
  jobId,
  currentCrewId,
  currentCrewName,
  currentCrewColor,
  crews,
  onAssigned,
  variant = 'chip',
  className,
}: CrewAssignSelectProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Optimistic local state — flips immediately on click.
  const [localCrewId, setLocalCrewId] = useState<string | null>(currentCrewId);
  const [localCrew, setLocalCrew] = useState<{ name: string; color: string } | null>(
    currentCrewName && currentCrewColor
      ? { name: currentCrewName, color: currentCrewColor }
      : null
  );

  async function assign(targetCrewId: string | null, targetCrew: Crew | null) {
    if (busy) return;
    if (targetCrewId === localCrewId) {
      setOpen(false);
      return;
    }

    const prevId = localCrewId;
    const prevCrew = localCrew;

    // Optimistic
    setLocalCrewId(targetCrewId);
    setLocalCrew(targetCrew ? { name: targetCrew.name, color: targetCrew.color } : null);
    setOpen(false);
    setBusy(true);

    const patch: Record<string, unknown> = { crew_id: targetCrewId };
    // If we're unassigning, drop the job back to "unscheduled" status only if
    // it was scheduled — keep complete/in_progress states intact.
    if (targetCrewId === null) {
      patch.status = 'unscheduled';
    }

    const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
    setBusy(false);

    if (error) {
      // Roll back
      setLocalCrewId(prevId);
      setLocalCrew(prevCrew);
      toast.error(error.message);
      return;
    }

    toast.success(
      targetCrew
        ? `Job reassigned to ${targetCrew.name}`
        : 'Job unassigned'
    );
    onAssigned?.(targetCrewId);
  }

  const triggerLabel = localCrew?.name ?? 'Unassigned';
  const triggerColor = localCrew?.color ?? '#9CA3AF';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          variant === 'chip'
            ? 'inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium hover:border-foreground/40 transition-colors'
            : 'inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:border-foreground/40 transition-colors',
          className
        )}
        title="Reassign crew"
        aria-label={`Reassign job — current crew ${triggerLabel}`}
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: triggerColor }}
        />
        <span className="truncate max-w-[120px]">{triggerLabel}</span>
        {busy
          ? <Loader2 className="h-3 w-3 animate-spin opacity-70" />
          : <ChevronDown className="h-3 w-3 opacity-60" />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-56 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Assign crew
        </p>
        <ul className="space-y-0.5">
          {crews.map((crew) => {
            const active = crew.id === localCrewId;
            return (
              <li key={crew.id}>
                <button
                  type="button"
                  onClick={() => assign(crew.id, crew)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    active ? 'bg-accent font-semibold' : 'hover:bg-accent/60'
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: crew.color }}
                  />
                  <span className="flex-1 truncate">{crew.name}</span>
                  {active && <Check className="h-3 w-3" />}
                </button>
              </li>
            );
          })}
          <li className="border-t mt-1 pt-1">
            <button
              type="button"
              onClick={() => assign(null, null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                localCrewId === null
                  ? 'bg-accent font-semibold'
                  : 'hover:bg-accent/60'
              )}
            >
              <UserMinus className="h-3 w-3 text-muted-foreground" />
              <span className="flex-1">Unassigned</span>
              {localCrewId === null && <Check className="h-3 w-3" />}
            </button>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
