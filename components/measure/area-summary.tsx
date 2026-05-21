'use client';

import {
  totalsByType, estimatedMowingPerVisit, estimatedAnnualMowing,
  type MeasuredShape,
} from '@/lib/measurement';
import { formatCurrency } from '@/lib/utils';

interface Props {
  shapes: MeasuredShape[];
}

export function AreaSummary({ shapes }: Props) {
  const totals = totalsByType(shapes);
  const perVisit = estimatedMowingPerVisit(totals.turf);
  const annual = estimatedAnnualMowing(totals.turf);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 text-sm min-w-0 max-w-full">
      <div>
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          Total turf
        </p>
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ color: 'var(--orange)' }}
        >
          {totals.turf.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">sq ft</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Hardscape</p>
          <p className="font-mono tabular-nums">{totals.hardscape.toLocaleString()} sf</p>
        </div>
        <div>
          <p className="text-muted-foreground">Beds</p>
          <p className="font-mono tabular-nums">{totals.bed.toLocaleString()} sf</p>
        </div>
        <div>
          <p className="text-muted-foreground">Other area</p>
          <p className="font-mono tabular-nums">{totals.other.toLocaleString()} sf</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total area</p>
          <p className="font-mono tabular-nums font-semibold">
            {totals.total.toLocaleString()} sf
          </p>
        </div>
        {totals.lineLength > 0 && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Total line length</p>
            <p className="font-mono tabular-nums">
              {totals.lineLength.toLocaleString()} ft
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-[var(--orange-soft)] p-3 space-y-1 min-w-0 max-w-full">
        <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--orange-deep)' }}>
          Pricing estimate
        </p>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-xs min-w-0 truncate" style={{ color: 'var(--orange-deep)' }}>Mowing per visit</span>
          <span className="font-mono font-semibold tabular-nums shrink-0 whitespace-nowrap" style={{ color: 'var(--orange-deep)' }}>
            {formatCurrency(perVisit)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-xs min-w-0 truncate" style={{ color: 'var(--orange-deep)' }}>Annual contract value</span>
          <span className="font-mono font-bold tabular-nums shrink-0 whitespace-nowrap" style={{ color: 'var(--orange-deep)' }}>
            {formatCurrency(annual)}
          </span>
        </div>
        <p className="text-[10px] text-[var(--orange-deep)]/70 break-words">
          $0.008/sq ft × 26 weekly visits — adjust per service in catalog.
        </p>
      </div>
    </div>
  );
}
