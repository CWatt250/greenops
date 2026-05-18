'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, MapPin, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StopDraft } from './stop-list';
import { CrewAssignSelect } from '@/components/jobs/crew-assign-select';
import type { Crew } from '@/types';

interface StopCardProps {
  stop: StopDraft;
  index: number;
  crewColor: string;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDurationChange: (minutes: number) => void;
  readonly?: boolean;
  /**
   * When provided, renders an inline crew picker on the card. The picker
   * writes back to the underlying job; the parent should reflect the change
   * by updating its local stop state via onCrewChange.
   */
  crews?: Crew[];
  onCrewChange?: (newCrewId: string | null) => void;
}

export function StopCard({
  stop,
  index,
  crewColor,
  isSelected,
  onSelect,
  onRemove,
  onDurationChange,
  readonly = false,
  crews,
  onCrewChange,
}: StopCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop._key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isAdHoc = stop.job_id === null;
  const clientName = isAdHoc
    ? (stop.label ?? 'Custom Stop')
    : ((stop.job?.client as { name: string } | null)?.name ?? 'Unknown Client');
  const address = isAdHoc
    ? (stop.address ?? '')
    : ((stop.job?.client as { service_address: string } | null)?.service_address ?? '');
  const subtitle = isAdHoc ? 'Custom stop' : (stop.job?.title ?? '');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex gap-2 rounded-lg border bg-card p-3 transition-shadow cursor-pointer',
        isSelected && 'ring-2 ring-primary shadow-sm',
        isDragging && 'opacity-50 shadow-xl z-50'
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      {!readonly && (
        <button
          {...attributes}
          {...listeners}
          className="flex items-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Stop number badge */}
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold shrink-0 mt-0.5"
        style={{ backgroundColor: crewColor }}
      >
        {index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold leading-tight truncate">{clientName}</p>
        {address && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground truncate">{address}</p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {stop.drive_minutes_from_prev > 0 && (
            <span className="text-xs text-blue-600 font-medium">
              +{Math.round(stop.drive_minutes_from_prev)}m drive
            </span>
          )}

          {/* Editable duration */}
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            {readonly ? (
              <span className="text-xs text-muted-foreground">
                {stop.estimated_duration_minutes}m
              </span>
            ) : (
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={stop.estimated_duration_minutes}
                onChange={(e) => onDurationChange(parseInt(e.target.value) || 30)}
                onClick={(e) => e.stopPropagation()}
                className="w-14 text-xs tabular-nums border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </div>

        {/* Job title / ad-hoc chip */}
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>

        {/* Inline crew reassignment — only available for job-backed stops. */}
        {crews && crews.length > 0 && stop.job_id && (
          <div className="pt-1">
            <CrewAssignSelect
              jobId={stop.job_id}
              currentCrewId={stop.assigned_crew_id ?? null}
              currentCrewName={
                stop.assigned_crew_id
                  ? crews.find((c) => c.id === stop.assigned_crew_id)?.name ?? null
                  : null
              }
              currentCrewColor={
                stop.assigned_crew_id
                  ? crews.find((c) => c.id === stop.assigned_crew_id)?.color ?? null
                  : null
              }
              crews={crews}
              onAssigned={(newCrewId) => onCrewChange?.(newCrewId)}
              variant="chip"
            />
          </div>
        )}
      </div>

      {/* Remove button */}
      {!readonly && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors rounded-full p-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
