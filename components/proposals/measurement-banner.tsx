'use client';

import { useState } from 'react';
import { Ruler, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  totalTurfSqft: number;
  /** Number of per-sqft line items currently in the proposal. */
  perSqftLineCount: number;
  /** Apply turf area to every per-sqft line's quantity. */
  onApply: () => void;
}

export function MeasurementBanner({ totalTurfSqft, perSqftLineCount, onApply }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  if (totalTurfSqft <= 0) return null;

  return (
    <div
      className="rounded-lg border-l-4 bg-[var(--orange-soft)] px-3 py-2.5 flex items-start gap-3"
      style={{ borderLeftColor: 'var(--orange)' }}
      role="region"
      aria-label="Measurement available"
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        <Ruler className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--orange-deep)' }}>
          Lawn measured at {totalTurfSqft.toLocaleString()} sq ft
        </p>
        <p className="text-[11px]" style={{ color: 'var(--orange-deep)' }}>
          {perSqftLineCount > 0
            ? `Apply to ${perSqftLineCount} per-sq-ft service${perSqftLineCount === 1 ? '' : 's'}?`
            : 'Add a per-sq-ft service to use this measurement.'}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {perSqftLineCount > 0 && (
          <Button
            size="sm"
            onClick={onApply}
            className="gap-1.5 h-7"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Sparkles className="h-3 w-3" />
            Apply
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
