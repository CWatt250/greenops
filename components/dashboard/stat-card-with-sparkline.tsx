'use client';

import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string | number;
  /** Sparkline series. Single number per point. Empty = no chart. */
  spark?: number[];
  /** "+3", "-$2,840", "+18%" — leading sign drives the up/down arrow. */
  delta?: string | null;
  /** Smaller subtitle below delta, e.g. "2 done · 3 active". */
  foot?: string | null;
  /** Color for the sparkline + delta arrow. Default: brand orange. */
  color?: string;
  className?: string;
}

export function StatCardWithSparkline({
  label,
  value,
  spark,
  delta,
  foot,
  color = 'var(--orange)',
  className,
}: Props) {
  const isUp = !!delta && delta.trim().startsWith('+');
  const isDown = !!delta && delta.trim().startsWith('-');

  const sparkData = (spark ?? []).map((y, i) => ({ i, y }));

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-5 flex flex-col gap-2 transition-all',
        'hover:shadow-md hover:-translate-y-0.5',
        className,
      )}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
        style={{ fontFamily: 'var(--font-hand), Caveat, cursive', letterSpacing: '0.04em', fontSize: 14, fontWeight: 600 }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-bold tabular-nums leading-none"
        style={{ fontFamily: 'var(--font-display), Impact, sans-serif' }}
      >
        {value}
      </p>
      {(delta || foot) && (
        <div className="flex items-center gap-2 text-[11px]">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold tabular-nums',
                isUp && 'text-emerald-600',
                isDown && 'text-rose-600',
                !isUp && !isDown && 'text-muted-foreground',
              )}
            >
              {isUp && <ArrowUp className="h-3 w-3" />}
              {isDown && <ArrowDown className="h-3 w-3" />}
              {delta}
            </span>
          )}
          {foot && <span className="text-muted-foreground truncate">{foot}</span>}
        </div>
      )}
      {sparkData.length > 1 && (
        <div className="h-9 -mx-1 mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="y"
                stroke={color}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
