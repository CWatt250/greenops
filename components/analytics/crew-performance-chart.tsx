'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { CHART_COLORS, CustomTooltip } from './revenue-chart';

interface CrewMonthRow {
  crew_id: string;
  crew_name: string;
  month: string;
  completed_jobs: number;
  issue_jobs: number;
  total_jobs: number;
}

interface Props {
  data: CrewMonthRow[];
  selectedCrewId: string | null;
  crewIds: Array<{ id: string; name: string; color: string }>;
  onCrewSelect: (id: string | null) => void;
}

const CrewTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-lg" style={{ backgroundColor: '#1C2B1A', color: '#fff' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value} jobs
        </p>
      ))}
    </div>
  );
};

export function CrewPerformanceChart({ data, selectedCrewId, crewIds, onCrewSelect }: Props) {
  const filtered = selectedCrewId
    ? data.filter((d) => d.crew_id === selectedCrewId)
    : data;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No crew performance data yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Crew filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCrewSelect(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !selectedCrewId
              ? 'text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          style={!selectedCrewId ? { backgroundColor: '#3D6B2C' } : {}}
        >
          All Crews
        </button>
        {crewIds.map((c) => (
          <button
            key={c.id}
            onClick={() => onCrewSelect(selectedCrewId === c.id ? null : c.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCrewId === c.id
                ? 'text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            style={selectedCrewId === c.id ? { backgroundColor: c.color } : {}}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            {c.name}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CrewTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="completed_jobs" name="Completed" fill={CHART_COLORS.complete} radius={[4, 4, 0, 0]} />
          <Bar dataKey="issue_jobs" name="Issues" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
