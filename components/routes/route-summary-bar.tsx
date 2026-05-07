'use client';

import { Clock, MapPin, Briefcase, Timer } from 'lucide-react';
import type { StopDraft } from './stop-list';

interface RouteSummaryBarProps {
  stops: StopDraft[];
  departureTime?: string; // HH:MM
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function addMinutes(timeStr: string, mins: number): string {
  const [hStr, mStr] = timeStr.split(':');
  const totalMins = parseInt(hStr) * 60 + parseInt(mStr) + Math.round(mins);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
}

export function RouteSummaryBar({ stops, departureTime = '08:00' }: RouteSummaryBarProps) {
  const totalDrive = stops.reduce((s, st) => s + (st.drive_minutes_from_prev ?? 0), 0);
  const totalWork = stops.reduce((s, st) => s + (st.estimated_duration_minutes ?? 30), 0);
  const totalMins = totalDrive + totalWork;
  const estDone = totalMins > 0 ? addMinutes(departureTime, totalMins) : null;

  return (
    <div
      className="flex items-center justify-around px-4 py-3 shrink-0 border-t"
      style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}
    >
      <div className="flex items-center gap-1.5 text-white/90">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="text-sm font-semibold tabular-nums">{stops.length}</span>
        <span className="text-xs text-white/60">stops</span>
      </div>

      <div className="w-px h-5 bg-white/20" />

      <div className="flex items-center gap-1.5 text-white/90">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="text-sm font-semibold tabular-nums">{formatMinutes(totalDrive)}</span>
        <span className="text-xs text-white/60">drive</span>
      </div>

      <div className="w-px h-5 bg-white/20" />

      <div className="flex items-center gap-1.5 text-white/90">
        <Briefcase className="h-3.5 w-3.5 shrink-0" />
        <span className="text-sm font-semibold tabular-nums">{formatMinutes(totalWork)}</span>
        <span className="text-xs text-white/60">work</span>
      </div>

      {estDone && (
        <>
          <div className="w-px h-5 bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/90">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm font-semibold">{estDone}</span>
            <span className="text-xs text-white/60">est done</span>
          </div>
        </>
      )}
    </div>
  );
}
