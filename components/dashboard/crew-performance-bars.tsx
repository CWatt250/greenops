import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface CrewPerformanceRow {
  id: string;
  name: string;
  color: string;
  scheduled: number;
  completed: number;
  /** On-time percentage (0–100). Optional — falls back to "—" when null. */
  onTimePct?: number | null;
}

interface Props {
  rows: CrewPerformanceRow[];
}

export function CrewPerformanceBars({ rows }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b">
        <h2
          className="text-base uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
        >
          Crew performance · today
        </h2>
        <Link
          href="/dashboard/analytics"
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Details <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 px-5 italic">
          No active crews — add one from the Crews page.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((c) => {
            const pct = c.scheduled > 0
              ? Math.round((c.completed / c.scheduled) * 100)
              : 0;
            return (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: c.color }}
                  />
                  <Link
                    href={`/dashboard/crews/${c.id}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {c.name}
                  </Link>
                </div>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                    aria-label={`${c.completed} of ${c.scheduled} jobs complete`}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums shrink-0 w-28 text-right">
                  {c.completed}/{c.scheduled}
                  {typeof c.onTimePct === 'number' ? ` · ${c.onTimePct}%` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
