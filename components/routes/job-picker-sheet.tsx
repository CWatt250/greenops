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
import { Loader2, Search, Clock, MapPin } from 'lucide-react';
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
  line_items: Array<{
    service: {
      estimated_duration_minutes: number | null;
      category: string | null;
    } | null;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  crews: Crew[];
  /** Default value for the date filter — usually the route's selected date. */
  defaultDate: string;
  /** Job IDs already in the route — these stay visible but checked + locked
   *  to prevent duplicate adds. */
  alreadyInRoute: Set<string>;
  /** Called with the chosen jobs (full rows) when the user taps "Add to Route". */
  onAdd: (jobs: PickerJob[]) => void;
}

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

export function JobPickerSheet({
  open, onOpenChange, companyId, crews, defaultDate, alreadyInRoute, onAdd,
}: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<PickerJob[]>([]);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string>(defaultDate);
  const [crewFilter, setCrewFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection + reload when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setDateFilter(defaultDate);
    setSearch('');
    setCrewFilter('all');
  }, [open, defaultDate]);

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
          line_items:job_line_items(service:services(estimated_duration_minutes, category))
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const inTitle = j.title?.toLowerCase().includes(q);
      const inClient = j.client?.name?.toLowerCase().includes(q);
      const inAddress = j.client?.service_address?.toLowerCase().includes(q);
      return inTitle || inClient || inAddress;
    });
  }, [jobs, search]);

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label htmlFor="picker-date" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Date
              </Label>
              <Input
                id="picker-date"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-9"
              />
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
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Clear date filter (show all dates)
            </button>
          )}
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
                        {timeLabel && <span>· {timeLabel}</span>}
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
