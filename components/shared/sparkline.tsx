'use client';

import { Line, LineChart, ResponsiveContainer } from 'recharts';

export interface SparklineProps {
  /** One number per point. Rendered left-to-right. */
  data: number[];
  /** Stroke color — accepts hex or a CSS variable like var(--orange). */
  color: string;
  strokeWidth?: number;
  animate?: boolean;
}

/**
 * Tiny line sparkline. Pulled into its own module so Recharts can be
 * code-split out of the initial bundle: consumers load it via
 * `dynamic(() => import('@/components/shared/sparkline'), { ssr: false })`.
 * Default export is required for next/dynamic.
 */
export default function Sparkline({ data, color, strokeWidth = 2, animate = false }: SparklineProps) {
  const d = data.map((y, i) => ({ i, y }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={d}>
        <Line
          type="monotone"
          dataKey="y"
          stroke={color}
          strokeWidth={strokeWidth}
          dot={false}
          isAnimationActive={animate}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
