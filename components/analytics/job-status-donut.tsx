'use client';

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from './revenue-chart';

interface JobStatusData {
  complete: number;
  in_progress: number;
  issue: number;
  cancelled: number;
}

const SEGMENTS = [
  { key: 'complete', label: 'Complete', color: CHART_COLORS.complete },
  { key: 'in_progress', label: 'In Progress', color: CHART_COLORS.warning },
  { key: 'issue', label: 'Issue', color: CHART_COLORS.danger },
  { key: 'cancelled', label: 'Cancelled', color: CHART_COLORS.muted },
] as const;

interface Props {
  data: JobStatusData;
}

const DonutTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-lg" style={{ backgroundColor: '#1C2B1A', color: '#fff' }}>
      <p style={{ color: payload[0].payload.color }} className="font-semibold">{payload[0].name}</p>
      <p>{payload[0].value} jobs</p>
    </div>
  );
};

export function JobStatusDonut({ data }: Props) {
  const chartData = SEGMENTS
    .map((s) => ({ name: s.label, value: data[s.key], color: s.color }))
    .filter((d) => d.value > 0);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No job data yet
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={72}
            outerRadius={108}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ top: -20 }}
      >
        <p className="text-2xl font-bold">{total}</p>
        <p className="text-xs text-muted-foreground">total jobs</p>
      </div>
    </div>
  );
}
