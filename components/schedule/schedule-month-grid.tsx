'use client';

import { cn } from '@/lib/utils';
import { localDateStr } from '@/lib/dates';
import type { Job, Crew } from '@/types';

interface ScheduleMonthGridProps {
  monthAnchor: Date; // any date in the month
  crews: Crew[];
  jobs: Job[];
  onDayClick: (date: Date) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function isToday(d: Date): boolean {
  return localDateStr(d) === localDateStr(new Date());
}

export function ScheduleMonthGrid({
  monthAnchor,
  crews,
  jobs,
  onDayClick,
}: ScheduleMonthGridProps) {
  // Build the visible grid: start at the Sunday before the 1st, render 6 rows.
  const monthStart = startOfMonth(monthAnchor);
  const gridStart = startOfWeekSunday(monthStart);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));

  // Group jobs by date and crew
  const jobsByDate = new Map<string, Job[]>();
  for (const j of jobs) {
    const ds = (j.scheduled_date as string | null) ?? null;
    if (!ds) continue;
    const list = jobsByDate.get(ds) ?? [];
    list.push(j);
    jobsByDate.set(ds, list);
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const ds = localDateStr(day);
          const inMonth = isSameMonth(day, monthAnchor);
          const dayJobs = jobsByDate.get(ds) ?? [];

          // Per-crew bucket for dot summary; null crew_id = "Unassigned".
          const crewCounts = new Map<string, number>();
          let unassignedCount = 0;
          for (const j of dayJobs) {
            if (!j.crew_id) { unassignedCount += 1; continue; }
            crewCounts.set(j.crew_id, (crewCounts.get(j.crew_id) ?? 0) + 1);
          }

          const today = isToday(day);

          return (
            <button
              key={ds}
              type="button"
              onClick={() => onDayClick(day)}
              className={cn(
                'border-b border-r last:border-r-0 p-2 min-h-[88px] text-left transition-colors hover:bg-accent/40 focus:outline-none focus:bg-accent/60',
                !inMonth && 'bg-muted/30 text-muted-foreground'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    today && 'bg-[var(--orange)] text-white'
                  )}
                >
                  {day.getDate()}
                </span>
                {dayJobs.length > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {dayJobs.length}
                  </span>
                )}
              </div>

              {/* Crew dots */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {crews.map((crew) => {
                  const count = crewCounts.get(crew.id) ?? 0;
                  if (count === 0) return null;
                  return (
                    <span
                      key={crew.id}
                      title={`${crew.name} · ${count} job${count === 1 ? '' : 's'}`}
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-mono leading-none"
                      style={{
                        backgroundColor: `${crew.color}22`,
                        color: crew.color,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: crew.color }}
                      />
                      {count}
                    </span>
                  );
                })}
                {unassignedCount > 0 && (
                  <span
                    title={`Unassigned · ${unassignedCount} job${unassignedCount === 1 ? '' : 's'}`}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-mono leading-none"
                    style={{ backgroundColor: '#94A3B822', color: '#475569' }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: '#94A3B8' }}
                    />
                    {unassignedCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
