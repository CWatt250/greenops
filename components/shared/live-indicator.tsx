'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveStatus } from '@/lib/hooks/use-live-data';

interface Props {
  status: LiveStatus;
  /** Optional timestamp shown after the indicator. */
  updatedAt?: Date;
  className?: string;
  /** Size variant — "sm" for tight headers, "md" for full bars. */
  size?: 'sm' | 'md';
}

const STATUS_META: Record<LiveStatus, { color: string; label: string; pulse: boolean; Icon: typeof Wifi }> = {
  connecting: { color: 'var(--muted-foreground)', label: 'Connecting…', pulse: true,  Icon: Wifi },
  live:       { color: '#10B981',                 label: 'Live',          pulse: true,  Icon: Wifi },
  polling:    { color: '#F59E0B',                 label: 'Polling',       pulse: false, Icon: Wifi },
  offline:    { color: '#EF4444',                 label: 'Offline',       pulse: false, Icon: WifiOff },
};

/**
 * Tiny green/yellow/red Realtime status pill. Mirrors the dispatch indicator
 * so portal pages and the admin pages share visual language.
 */
export function LiveIndicator({ status, updatedAt, className, size = 'sm' }: Props) {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  const labelClass = size === 'md'
    ? 'text-xs font-bold uppercase tracking-wider'
    : 'text-[10px] font-bold uppercase tracking-wider';

  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="status">
      <span
        className={cn('inline-block h-2 w-2 rounded-full', m.pulse && 'animate-pulse')}
        style={{ backgroundColor: m.color }}
      />
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} style={{ color: m.color }} />
      <span className={labelClass} style={{ color: m.color }}>
        {m.label}
      </span>
      {updatedAt && (
        <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
          · {updatedAt.toLocaleTimeString()}
        </span>
      )}
    </span>
  );
}
