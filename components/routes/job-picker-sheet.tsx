'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Clock, MapPin, X } from 'lucide-react';
import { resolveJobDurationMinutes } from '@/lib/vroom';
import type { Crew } from '@/types';

export interface PickerJob {
  id: string;
  title: string;
  status: string;
  crew_id: string | null;
  scheduled_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_duration_minutes: number | null;
  time_window_start: string | null;
  time_window_end: string | null;
  client: {
    id: string;
    name: string;
    service_address: string | null;
    service_city: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  job_services?: Array<{
    duration_minutes: number | null;
    quantity: number | null;
    service: {
      estimated_duration_minutes: number | null;
      category: string | null;
    } | null;
  }>;
  line_items: Array<{
    service_id: string | null;
    service: {
      id: string | null;
      name: string | null;
      estimated_duration_minutes: number | null;
      category: string | null;
    } | null;
  }>;
}

interface ServiceOption {
  id: string;
  name: string;
  category: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  crews: Crew[];
  /** Default value for the date filter — the picker now defaults to "Any date"
   *  regardless of what's passed here, but the prop is retained so callers
   *  can still seed it if they later want to. */
  defaultDate: string;
  /** Job IDs already in the route — these stay visible but checked + locked
   *  to prevent duplicate adds. */
  alreadyInRoute: Set<string>;
  /** Called with the chosen jobs (full rows) when the user taps "Add to Route". */
  onAdd: (jobs: PickerJob[]) => void;
}

// Quick visual cues so Trent can scan the service dropdown without reading.
const CATEGORY_EMOJI: Record<string, string> = {
  mowing: '🌿',
  edging: '✂️',
  fertilization: '🌱',
  aeration: '🕳️',
  cleanup: '🍂',
  tree: '🌳',
  sprinkler: '💧',
  snow: '❄️',
  holiday: '🎄',
  overseeding: '🌾',
  mulch: '🪵',
  other: '🛠️',
};

function formatDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr); const m = Number(mStr ?? 0);
  if (!Number.isFinite(h)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatShortDate(d: string | null): string | null {
  if (!d) return null;
  // Parse as local midday to avoid off-by-one when the YYYY-MM-DD is
  // interpreted as UTC.
  const dt = new Date(`${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function JobPickerSheet({
  open, onOpenChange, companyId, crews, alreadyInRoute, onAdd,
}: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<PickerJob[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [search, setSearch] = useState('');
  // Default to "Any date" — when Trent is building today's route the jobs
  // he wants are usually scheduled later in the week, so pinning to today
  // makes the picker look broken.
  const [dateFilter, setDateFilter] = useState<string>('');
  const [crewFilter, setCrewFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset every time the sheet opens — keeps state fresh for the next route.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setDateFilter('');
    setSearch('');
    setCrewFilter('all');
    setServiceFilter('all');
  }, [open]);

  // Load the company's services for the dropdown options. Cached for the
  // lifetime of the open sheet — small list, doesn't change mid-session.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    supabase
      .from('services')
      .select('id, name, category')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setServices(((data ?? []) as unknown) as ServiceOption[]);
      });
    return () => { cancelled = true; };
  }, [open, companyId]);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Picker shows schedulable jobs only — completed/cancelled/in-progress
      // jobs aren't candidates for inclusion in a new route plan.
      let q = supabase
        .from('jobs')
        .select(`
          id, title, status, crew_id, scheduled_date, scheduled_start, scheduled_end,
          estimated_duration_minutes, time_window_start, time_window_end,
          client:clients(id, name, service_address, service_city, latitude, longitude),
          job_services(
            duration_minutes,
            quantity,
            service:services(estimated_duration_minutes, category)
          ),
          line_items:job_line_items(
            service_id,
            service:services(id, name, estimated_duration_minutes, category)
          )
        `)
        .eq('company_id', companyId)
        .in('status', ['unscheduled', 'scheduled', 'en_route'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('scheduled_start', { ascending: true, nullsFirst: false })
        .limit(200);
      if (dateFilter) q = q.eq('scheduled_date', dateFilter);
      if (crewFilter && crewFilter !== 'all') {
        q = crewFilter === '__unassigned' ? q.is('crew_id', null) : q.eq('crew_id', crewFilter);
      }
      const { data } = await q;
      if (cancelled) return;
      setJobs(((data ?? []) as unknown) as PickerJob[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId, dateFilter, crewFilter]);

  const crewById = useMemo(() => {
    const m = new Map<string, Crew>();
    for (const c of crews) m.set(c.id, c);
    return m;
  }, [crews]);

  const serviceById = useMemo(() => {
    const m = new Map<string, ServiceOption>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  // Filter + sort. Service filtering is client-side because checking the
  // joined line_items in PostgREST is awkward; the dataset is already
  // capped at 200 rows so the local pass is cheap.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedService = serviceFilter !== 'all' ? serviceById.get(serviceFilter) ?? null : null;

    let next = jobs.filter((j) => {
      // Search filter
      if (q) {
        const inTitle = j.title?.toLowerCase().includes(q);
        const inClient = j.client?.name?.toLowerCase().includes(q);
        const inAddress = j.client?.service_address?.toLowerCase().includes(q);
        if (!inTitle && !inClient && !inAddress) return false;
      }
      // Service filter — match by line-item service_id first, then fall
      // back to a fuzzy title match so older un-itemized jobs still surface.
      if (selectedService) {
        const lineMatch = j.line_items?.some((li) => li.service_id === selectedService.id);
        if (lineMatch) return true;
        const fuzzy = selectedService.name?.toLowerCase();
        return !!(fuzzy && j.title?.toLowerCase().includes(fuzzy));
      }
      return true;
    });

    // Sort: when "Any date" is selected we span multiple dates, so sort by
    // scheduled_date asc and push unscheduled jobs to the bottom. With a
    // specific date pinned, server-side ordering (scheduled_start) already
    // suffices.
    if (!dateFilter) {
      next = [...next].sort((a, b) => {
        if (a.scheduled_date && b.scheduled_date) {
          const dc = a.scheduled_date.localeCompare(b.scheduled_date);
          if (dc !== 0) return dc;
          return (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? '');
        }
        if (a.scheduled_date) return -1;
        if (b.scheduled_date) return 1;
        return 0;
      });
    }
    return next;
  }, [jobs, search, serviceFilter, serviceById, dateFilter]);

  // Live "X jobs selected · total Yh Zm" — sum the resolved durations.
  const summary = useMemo(() => {
    let total = 0;
    for (const j of jobs) {
      if (!selected.has(j.id)) continue;
      total += resolveJobDurationMinutes(j, { jobId: j.id, jobTitle: j.title });
    }
    return { count: selected.size, totalLabel: formatDuration(total) };
  }, [jobs, selected]);

  function toggle(id: string) {
    if (alreadyInRoute.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const picked = jobs.filter((j) => selected.has(j.id));
    onAdd(picked);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Pick Jobs</SheetTitle>
          <SheetDescription>
            Check the jobs you want on this route. Only schedulable jobs appear.
          </SheetDescription>
        </SheetHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-2.5 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label htmlFor="picker-date" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Date
              </Label>
              <div className="relative">
                <Input
                  id="picker-date"
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  placeholder="Any date"
                  className="h-9 pr-8"
                />
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    aria-label="Clear date filter"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {dateFilter ? formatShortDate(dateFilter) ?? '—' : 'Any date'}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Crew
              </Label>
              <Select value={crewFilter} onValueChange={(v) => setCrewFilter(v ?? 'all')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crews</SelectItem>
                  <SelectItem value="__unassigned">Unassigned only</SelectItem>
                  {crews.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Service
              </Label>
              <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v ?? 'all')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {services.map((s) => {
                    const emoji = (s.category && CATEGORY_EMOJI[s.category]) || '🛠️';
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden>{emoji}</span>
                          <span>{s.name}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client name, job title, or address…"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              No schedulable jobs match these filters.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((j) => {
                const crew = j.crew_id ? crewById.get(j.crew_id) : null;
                const checked = selected.has(j.id) || alreadyInRoute.has(j.id);
                const locked = alreadyInRoute.has(j.id);
                const duration = resolveJobDurationMinutes(j, { jobId: j.id, jobTitle: j.title });
                const timeLabel = formatTime(j.scheduled_start);
                const dateLabel = formatShortDate(j.scheduled_date);
                // Compose date+time as a single chip when the picker is
                // showing multiple dates ("Any date" mode). With a specific
                // date pinned the date is redundant — show just the time.
                const whenLabel = !dateFilter && dateLabel
                  ? (timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel)
                  : (timeLabel ?? null);
                return (
                  <li
                    key={j.id}
                    onClick={() => toggle(j.id)}
                    className={`flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-muted/40 ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: crew?.color ?? '#D1D5DB',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggle(j.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 accent-[var(--color-brand-green-raw,#3D6B2C)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{j.title}</p>
                      {j.client && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="truncate">
                            {j.client.name}
                            {j.client.service_address ? ` · ${j.client.service_address}` : ''}
                            {j.client.service_city ? `, ${j.client.service_city}` : ''}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-1">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-3 w-3" /> {formatDuration(duration)}
                        </span>
                        {whenLabel
                          ? <span>· {whenLabel}</span>
                          : <span className="italic">· Unscheduled</span>}
                        {locked && <span className="text-amber-700">· already on route</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-card flex items-center gap-3">
          <div className="text-xs flex-1">
            <p className="font-semibold">
              {summary.count} job{summary.count === 1 ? '' : 's'} selected
            </p>
            <p className="text-muted-foreground">Total: {summary.totalLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={summary.count === 0}
            onClick={handleAdd}
            style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
          >
            Add to Route
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
