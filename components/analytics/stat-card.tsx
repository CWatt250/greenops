'use client';

import dynamic from 'next/dynamic';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Recharts is heavy (~310 KB chunk). Load the sparkline only on the client,
// after first paint, so it never lands in this route's First Load JS.
const Sparkline = dynamic(() => import('@/components/shared/sparkline'), { ssr: false });

interface StatCardProps {
  title: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  sparklineData?: number[];
}

const SPARK_COLOR = '#3D6B2C';

export function StatCard({ title, value, prefix, suffix, trend, trendLabel, sparklineData }: StatCardProps) {
  return (
    <div className="rounded-xl bg-card border overflow-hidden" style={{ borderTop: '4px solid #3D6B2C' }}>
      <div className="px-5 pt-4 pb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <div className="flex items-end justify-between mt-1 gap-2">
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {prefix && <span className="text-lg font-semibold mr-0.5">{prefix}</span>}
            {value}
            {suffix && <span className="text-base font-medium text-muted-foreground ml-0.5">{suffix}</span>}
          </p>
          {sparklineData && sparklineData.length > 0 && (
            <div className="h-[50px] w-[80px] shrink-0">
              <Sparkline data={sparklineData} color={SPARK_COLOR} strokeWidth={2} />
            </div>
          )}
        </div>
        {(trend || trendLabel) && (
          <div className="flex items-center gap-1 mt-2">
            {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-green-600" />}
            {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            {trend === 'neutral' && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
            {trendLabel && (
              <span className={cn(
                'text-xs font-medium',
                trend === 'up' && 'text-green-600',
                trend === 'down' && 'text-red-500',
                trend === 'neutral' && 'text-muted-foreground',
              )}>
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
