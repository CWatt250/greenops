'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from './chart-colors';

export interface TrendPoint { month: string; rate: number; completed?: number; total?: number }

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: TrendPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">{p.rate}% complete{p.total != null ? ` · ${p.completed ?? 0}/${p.total} jobs` : ''}</p>
    </div>
  );
}

/** Loaded with next/dynamic so Recharts stays out of the page's first bundle. */
export default function CompletionTrendChart({ data, color }: { data: TrendPoint[]; color?: string | null }) {
  const stroke = color ?? CHART_COLORS.primary;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<TrendTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="rate" name="Completion %" stroke={stroke} strokeWidth={2.5} dot={{ r: 3, fill: stroke }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
