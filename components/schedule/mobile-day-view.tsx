'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { localDateStr } from '@/lib/dates';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Filter, Check, UsersRound, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { Job, Crew } from '@/types';

interface MobileDayViewProps {
  date: Date;
  crews: Crew[];
  jobs: Job[];
  onStepDay: (direction: 1 | -1) => void;
  onJumpToday: () => void;
}

const UNASSIGNED_COLOR = '#94A3B8';
const SWIPE_THRESHOLD_PX = 60;

function isToday(d: Date): boolean {
  return localDateStr(d) === localDateStr(new Date());
}

function formatHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function parseHHMM(value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function tintFromHex(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/.{1,2}/g);
  if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = m.map((p) => parseInt(p, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatMobileDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface MobileJobCardProps {
  job: Job;
  crews: Crew[];
}

/**
 * Tap-to-assign: drag-and-drop between crew lanes is a desktop gesture, so on
 * phones each card gets an "Assign" control that opens a crew menu. The
 * schedule page's realtime subscription refreshes the list after the write.
 */
function AssignCrewMenu({ job, crews }: { job: Job; crews: Crew[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = job.crew as { id: string; name: string; color?: string } | undefined;

  async function assign(crewId: string | null) {
    setBusy(true);
    const supabase = createClient();
    const patch: Record<string, unknown> = { crew_id: crewId, updated_at: new Date().toISOString() };
    if (crewId && job.status === 'unscheduled') patch.status = 'scheduled';
    const { error } = await supabase.from('jobs').update(patch).eq('id', job.id);
    setBusy(false);
    setOpen(false);
    if (error) { toast.error(error.message); return; }
    const name = crewId ? crews.find((c) => c.id === crewId)?.name ?? 'crew' : 'Unassigned';
    toast.success(`${job.title} → ${name}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        aria-expanded={open}
        aria-label={`Assign crew for ${job.title}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium active:bg-muted"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UsersRound className="h-3.5 w-3.5" />}
        {current?.name ? 'Reassign' : 'Assign crew'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md" role="menu" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {[{ id: null as string | null, name: 'Unassigned', color: UNASSIGNED_COLOR }, ...crews.map((c) => ({ id: c.id as string | null, name: c.name, color: c.color }))].map((opt) => {
            const active = (job.crew_id ?? null) === opt.id;
            return (
              <button
                key={opt.id ?? '__none__'}
                type="button"
                role="menuitem"
                onClick={() => { void assign(opt.id); }}
                className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm', active ? 'bg-muted font-medium' : 'hover:bg-muted/50')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                <span className="flex-1 truncate">{opt.name}</span>
                {active && <Check className="h-4 w-4 text-[var(--orange)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileJobCard({ job, crews }: MobileJobCardProps) {
  const crew = job.crew as { id: string; name: string; color?: string } | undefined;
  const stripeColor = crew?.color ?? UNASSIGNED_COLOR;
  const start = formatHHMM(job.scheduled_start as string | null);
  const end = formatHHMM(job.scheduled_end as string | null);
  const timeWindow = start ? (end ? `${start} – ${end}` : start) : 'No time set';
  const client = (job.client as { name?: string; service_address?: string } | null) ?? null;

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="relative block rounded-lg border bg-card overflow-hidden active:opacity-80 transition-opacity"
      style={{ backgroundColor: tintFromHex(stripeColor, 0.06) }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ backgroundColor: stripeColor }}
      />
      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {timeWindow}
          </span>
          <StatusBadge status={job.status} type="job" />
        </div>
        <p className="font-semibold text-sm leading-tight truncate">
          {job.title}
        </p>
        {client?.name && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {client.name}
            {client.service_address ? ` · ${client.service_address}` : ''}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: stripeColor }}
              aria-hidden
            />
            <span className="text-[11px] text-muted-foreground truncate">
              {crew?.name ?? 'Unassigned'}
            </span>
          </div>
          <AssignCrewMenu job={job} crews={crews} />
        </div>
      </div>
    </Link>
  );
}

export function MobileDayView({
  date,
  crews,
  jobs,
  onStepDay,
  onJumpToday,
}: MobileDayViewProps) {
  const [crewFilter, setCrewFilter] = useState<string | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeHandled = useRef(false);

  const filteredJobs = useMemo(() => {
    const list = crewFilter === 'all'
      ? jobs
      : jobs.filter((j) =>
          crewFilter === '__unassigned__'
            ? !j.crew_id
            : j.crew_id === crewFilter
        );
    return [...list].sort(
      (a, b) =>
        parseHHMM(a.scheduled_start as string | null) -
        parseHHMM(b.scheduled_start as string | null)
    );
  }, [jobs, crewFilter]);

  const activeFilterLabel = useMemo(() => {
    if (crewFilter === 'all') return 'All crews';
    if (crewFilter === '__unassigned__') return 'Unassigned';
    return crews.find((c) => c.id === crewFilter)?.name ?? 'All crews';
  }, [crewFilter, crews]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    swipeHandled.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (swipeHandled.current) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeHandled.current = true;
      onStepDay(dx < 0 ? 1 : -1);
    }
  }

  function onTouchEnd() {
    touchStartX.current = null;
    touchStartY.current = null;
  }

  return (
    <div className="md:hidden">
      {/* Sticky header: date stepper + filter chip.
          Offset by the dashboard's mobile top bar (h-14 = 3.5rem). */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStepDay(-1)}
            aria-label="Previous day"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border bg-background active:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-sm font-semibold leading-tight truncate">
              {formatMobileDayLabel(date)}
            </div>
            {!isToday(date) && (
              <button
                type="button"
                onClick={onJumpToday}
                className="text-[11px] text-[var(--orange)] font-medium"
              >
                Jump to today
              </button>
            )}
            {isToday(date) && (
              <span className="text-[11px] text-[var(--orange)] font-semibold">
                Today
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onStepDay(1)}
            aria-label="Next day"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border bg-background active:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium active:bg-muted"
            aria-expanded={filterOpen}
          >
            <Filter className="h-3 w-3" />
            {activeFilterLabel}
          </button>
          {filterOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-30 w-56 rounded-md border bg-popover shadow-md p-1"
              role="menu"
            >
              {(
                [
                  { id: 'all' as const, name: 'All crews', color: null },
                  { id: '__unassigned__' as const, name: 'Unassigned', color: UNASSIGNED_COLOR },
                  ...crews.map((c) => ({ id: c.id, name: c.name, color: c.color })),
                ]
              ).map((opt) => {
                const active = crewFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setCrewFilter(opt.id);
                      setFilterOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                      active ? 'bg-muted font-medium' : 'hover:bg-muted/50'
                    )}
                  >
                    {opt.color ? (
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: opt.color }}
                      />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{opt.name}</span>
                    {active && <Check className="h-4 w-4 text-[var(--orange)]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Swipeable list body */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="pt-3 pb-24"
      >
        {filteredJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center">
            <p className="text-sm font-medium">No jobs scheduled</p>
            <p className="text-xs text-muted-foreground mt-1">
              {crewFilter === 'all'
                ? 'Swipe left or right to change days, or add a new job.'
                : `No jobs for ${activeFilterLabel} on this day.`}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredJobs.map((job) => (
              <li key={job.id}>
                <MobileJobCard job={job} crews={crews} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Floating "+ New Job" button */}
      <Link
        href="/dashboard/jobs/new"
        aria-label="New job"
        className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-30 h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-white"
        style={{ backgroundColor: 'var(--orange)' }}
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
