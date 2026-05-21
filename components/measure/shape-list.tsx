'use client';

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GripVertical, Trash2, Crosshair } from 'lucide-react';
import {
  AREA_TYPE_LABELS, LINE_TYPE_LABELS, SHAPE_TYPE_COLORS,
  type MeasuredShape, type ShapeType,
} from '@/lib/measurement';

interface Props {
  shapes: MeasuredShape[];
  onUpdate: (id: string, patch: Partial<MeasuredShape>) => void;
  onRemove: (id: string) => void;
  onReorder: (shapes: MeasuredShape[]) => void;
  onFocus?: (id: string) => void;
}

export function ShapeList({ shapes, onUpdate, onRemove, onReorder, onFocus }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = shapes.findIndex((s) => s.id === active.id);
    const newIndex = shapes.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(shapes, oldIndex, newIndex));
  }

  if (shapes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-xs text-muted-foreground">
          No shapes drawn yet. Use the polygon tool on the map to outline an area, or the line tool to measure a distance.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={shapes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {shapes.map((s, i) => (
            <Row
              key={s.id}
              shape={s}
              index={i}
              onUpdate={(patch) => onUpdate(s.id, patch)}
              onRemove={() => onRemove(s.id)}
              onFocus={onFocus}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  shape, index, onUpdate, onRemove, onFocus,
}: {
  shape: MeasuredShape;
  index: number;
  onUpdate: (patch: Partial<MeasuredShape>) => void;
  onRemove: () => void;
  onFocus?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: shape.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isLine = shape.kind === 'line';
  const typeOptions = isLine ? LINE_TYPE_LABELS : AREA_TYPE_LABELS;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-3 space-y-2 ${isDragging ? 'opacity-60 shadow-xl' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
          style={{ backgroundColor: SHAPE_TYPE_COLORS[shape.type] }}
        >
          {index + 1}
        </span>
        <Input
          value={shape.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-8 text-sm font-medium flex-1 min-w-0"
        />
        {onFocus && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onFocus(shape.id)}
            aria-label="Focus on this shape"
            title="Focus on this shape"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRemove}
          aria-label="Remove shape"
          title="Remove shape"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <Select
          value={shape.type}
          onValueChange={(v) => onUpdate({ type: v as ShapeType })}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(typeOptions) as ShapeType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {typeOptions[t as keyof typeof typeOptions]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0 whitespace-nowrap">
          {isLine
            ? `${shape.length_ft.toLocaleString()} ft`
            : `${shape.area_sqft.toLocaleString()} sq ft`}
        </span>
      </div>
    </li>
  );
}
