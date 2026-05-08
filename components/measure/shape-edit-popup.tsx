'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2, X } from 'lucide-react';
import {
  AREA_TYPE_LABELS, LINE_TYPE_LABELS, SHAPE_TYPE_COLORS,
  type MeasuredShape, type ShapeType,
} from '@/lib/measurement';

interface Props {
  shape: MeasuredShape;
  /** Pixel coords on the map container where the popup should anchor. */
  position: { x: number; y: number };
  onChange: (patch: Partial<MeasuredShape>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ShapeEditPopup({ shape, position, onChange, onDelete, onClose }: Props) {
  const isLine = shape.kind === 'line';
  const typeOptions = isLine ? LINE_TYPE_LABELS : AREA_TYPE_LABELS;

  // Clamp the popup to roughly the visible area so it doesn't render off-screen.
  const left = Math.max(12, position.x - 130);
  const top = Math.max(12, position.y - 180);

  return (
    <div
      className="absolute z-30 w-[260px] rounded-xl border bg-popover shadow-xl ring-1 ring-foreground/10 p-3 space-y-2"
      style={{ left, top }}
      role="dialog"
      aria-label="Edit shape"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: SHAPE_TYPE_COLORS[shape.type] }}
          />
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {isLine
              ? `${shape.length_ft.toLocaleString()} ft`
              : `${shape.area_sqft.toLocaleString()} sq ft`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          Label
        </label>
        <Input
          value={shape.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 text-sm"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          Type
        </label>
        <Select
          value={shape.type}
          onValueChange={(v) => onChange({ type: v as ShapeType })}
        >
          <SelectTrigger className="h-8 text-xs">
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
      </div>

      <div className="flex justify-end pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    </div>
  );
}
