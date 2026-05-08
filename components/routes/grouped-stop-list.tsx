'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Clock, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StopCard } from './stop-card';
import type { StopDraft } from './stop-list';
import type { Crew } from '@/types';

interface GroupedStopListProps {
  groups: Array<{ crew: Crew; stops: StopDraft[] }>;
  unassignedStops?: StopDraft[];
  selectedStopId: string | null;
  onStopSelect: (id: string | null) => void;
  onRemove: (key: string) => void;
  onDurationChange: (key: string, minutes: number) => void;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function GroupedStopList({
  groups,
  unassignedStops,
  selectedStopId,
  onStopSelect,
  onRemove,
  onDurationChange,
}: GroupedStopListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasGroups = groups.length > 0;
  const unassigned = unassignedStops ?? [];

  return (
    <div className="space-y-3 p-3">
      {hasGroups &&
        groups.map(({ crew, stops }) => {
          const isCollapsed = collapsed.has(crew.id);
          const totalDrive = stops.reduce(
            (s, st) => s + (st.drive_minutes_from_prev ?? 0),
            0
          );
          const totalWork = stops.reduce(
            (s, st) => s + (st.estimated_duration_minutes ?? 30),
            0
          );

          return (
            <div
              key={crew.id}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(crew.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: crew.color }}
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">
                    {crew.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      {stops.length} stop{stops.length === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatMinutes(totalDrive)} drive
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-2.5 w-2.5" />
                      {formatMinutes(totalWork)} work
                    </span>
                  </span>
                </span>
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {!isCollapsed && (
                <div
                  className={cn(
                    'border-t space-y-2 p-3',
                    stops.length === 0 && 'py-6'
                  )}
                >
                  {stops.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center italic">
                      VROOM didn't route any stops to this crew.
                    </p>
                  ) : (
                    stops.map((stop, i) => (
                      <StopCard
                        key={stop._key}
                        stop={stop}
                        index={i}
                        crewColor={crew.color}
                        isSelected={stop._key === selectedStopId}
                        onSelect={() =>
                          onStopSelect(
                            stop._key === selectedStopId ? null : stop._key
                          )
                        }
                        onRemove={() => onRemove(stop._key)}
                        onDurationChange={(mins) =>
                          onDurationChange(stop._key, mins)
                        }
                        readonly
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

      {/* Unassigned bucket — always visible when there are unassigned stops */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-dashed bg-card overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30">
            <p className="text-sm font-semibold">
              {hasGroups ? 'Unassigned' : 'All Stops'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {hasGroups
                ? 'VROOM didn’t fit these into any crew.'
                : 'Click Optimize Routes to distribute these across selected crews.'}
            </p>
          </div>
          <div className="space-y-2 p-3">
            {unassigned.map((stop, i) => (
              <StopCard
                key={stop._key}
                stop={stop}
                index={i}
                crewColor="#9CA3AF"
                isSelected={stop._key === selectedStopId}
                onSelect={() =>
                  onStopSelect(
                    stop._key === selectedStopId ? null : stop._key
                  )
                }
                onRemove={() => onRemove(stop._key)}
                onDurationChange={(mins) => onDurationChange(stop._key, mins)}
                readonly
              />
            ))}
          </div>
        </div>
      )}

      {!hasGroups && unassigned.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No stops loaded.
        </div>
      )}
    </div>
  );
}
