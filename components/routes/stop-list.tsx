'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { StopCard } from './stop-card';
import type { Job } from '@/types';

export interface StopDraft {
  _key: string;
  // Job-backed stop (from auto-load). When null, this is an ad-hoc stop.
  job_id: string | null;
  job: (Job & { client: { id: string; name: string; service_address: string } | null }) | null;
  // Ad-hoc fields. For job-backed stops, label/address are derived from the job.
  label?: string | null;
  address?: string | null;
  stop_order: number;
  estimated_duration_minutes: number;
  drive_minutes_from_prev: number;
  drive_distance_miles: number;
  lat: number | null;
  lng: number | null;
  // Multi-crew mode: which crew VROOM (or the user) assigned this stop to.
  // Null = unassigned (waiting on optimization).
  assigned_crew_id?: string | null;
  // VROOM skills this stop requires (migration 045) — the skill_id of each
  // RESTRICTED service on the job. Empty/undefined = any crew can take it.
  skills?: number[];
}

interface StopListProps {
  stops: StopDraft[];
  crewColor: string;
  selectedStopId: string | null;
  onReorder: (stops: StopDraft[]) => void;
  onRemove: (key: string) => void;
  onDurationChange: (key: string, minutes: number) => void;
  onStopSelect: (id: string | null) => void;
  readonly?: boolean;
  emptyState?: React.ReactNode;
}

export function StopList({
  stops,
  crewColor,
  selectedStopId,
  onReorder,
  onRemove,
  onDurationChange,
  onStopSelect,
  readonly = false,
  emptyState,
}: StopListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = stops.findIndex((s) => s._key === active.id);
    const newIndex = stops.findIndex((s) => s._key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(stops, oldIndex, newIndex).map((s, i) => ({
      ...s,
      stop_order: i + 1,
    }));
    onReorder(reordered);
  }

  if (stops.length === 0) {
    return emptyState ?? (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <p className="text-sm text-muted-foreground">No stops yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select a crew and date to load jobs, or add stops manually.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={readonly ? [] : [restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={stops.map((s) => s._key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 p-3">
          {stops.map((stop, i) => (
            <StopCard
              key={stop._key}
              stop={stop}
              index={i}
              crewColor={crewColor}
              isSelected={stop._key === selectedStopId}
              onSelect={() =>
                onStopSelect(stop._key === selectedStopId ? null : stop._key)
              }
              onRemove={() => onRemove(stop._key)}
              onDurationChange={(mins) => onDurationChange(stop._key, mins)}
              readonly={readonly}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
