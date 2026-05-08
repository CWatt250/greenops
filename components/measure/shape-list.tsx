'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  SHAPE_TYPE_COLORS, SHAPE_TYPE_LABELS,
  type MeasuredShape, type ShapeType,
} from '@/lib/measurement';

interface Props {
  shapes: MeasuredShape[];
  onUpdate: (id: string, patch: Partial<MeasuredShape>) => void;
  onRemove: (id: string) => void;
}

export function ShapeList({ shapes, onUpdate, onRemove }: Props) {
  if (shapes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-xs text-muted-foreground">
          No shapes drawn yet. Use the polygon tool on the map to outline an area.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {shapes.map((s) => (
        <li
          key={s.id}
          className="rounded-lg border bg-card p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: SHAPE_TYPE_COLORS[s.type] }}
            />
            <Input
              value={s.label}
              onChange={(e) => onUpdate(s.id, { label: e.target.value })}
              className="h-8 text-sm font-medium flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRemove(s.id)}
              aria-label="Remove shape"
              title="Remove shape"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Select
              value={s.type}
              onValueChange={(v) => onUpdate(s.id, { type: v as ShapeType })}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SHAPE_TYPE_LABELS) as ShapeType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {SHAPE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {s.area_sqft.toLocaleString()} sq ft
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
