'use client';

interface Props {
  pointCount: number;
  tool: 'polygon' | 'line' | null;
  onAddPoint: () => void;
  onCloseShape: () => void;
}

export function DrawingControls({ pointCount, tool, onAddPoint, onCloseShape }: Props) {
  if (!tool) return null;
  return (
    <div className="pointer-events-auto w-full px-3 flex flex-col gap-2">
      <p className="text-center text-xs rounded-lg bg-background/90 backdrop-blur-sm py-1.5 px-3">
        Pan map to position crosshair, then tap <strong>Add Point</strong>
      </p>
      {pointCount > 0 && (
        <p className="text-center text-xs font-mono tabular-nums text-muted-foreground">
          {pointCount} point{pointCount === 1 ? '' : 's'} placed
        </p>
      )}
      <button
        type="button"
        onClick={onAddPoint}
        className="w-full h-14 rounded-xl font-bold text-base text-white flex items-center justify-center gap-2 shadow-lg"
        style={{ backgroundColor: '#F15A24' }}
      >
        📍 Add Point
      </button>
      {pointCount >= 3 && (
        <button
          type="button"
          onClick={onCloseShape}
          className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 shadow"
          style={{
            backgroundColor: 'var(--orange-soft)',
            color: 'var(--orange-deep)',
            borderColor: '#F15A24',
          }}
        >
          ✅ Close Shape
        </button>
      )}
    </div>
  );
}
