'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowRoutesWorks } from '@/components/help/how-page-works';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, Plus, MapPin, Clock, Timer, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route, RouteStop, Crew } from '@/types';

type RouteWithCrew = Route & {
  crew: Crew | null;
  stops: RouteStop[];
};

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = toDateStr(new Date());
  if (dateStr === today) return 'Today';
  const tomorrow = toDateStr(addDays(new Date(), 1));
  if (dateStr === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatMinutes(mins: number | null | undefined) {
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  complete: 'bg-green-100 text-green-700',
};

export default function RoutesPage() {
  const supabase = createClient();
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [routes, setRoutes] = useState<RouteWithCrew[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    const { data: routeRows } = await supabase
      .from('routes')
      .select('*, crew:crews(*)')
      .eq('route_date', selectedDate)
      .order('created_at');

    if (!routeRows?.length) {
      setRoutes([]);
      setLoading(false);
      return;
    }

    const routeIds = routeRows.map((r) => r.id);
    const { data: stopRows } = await supabase
      .from('route_stops')
      .select('*, job:jobs(id,title,client:clients(name,service_address))')
      .in('route_id', routeIds)
      .order('stop_order');

    const stopsByRoute: Record<string, RouteStop[]> = {};
    for (const stop of stopRows ?? []) {
      if (!stopsByRoute[stop.route_id]) stopsByRoute[stop.route_id] = [];
      stopsByRoute[stop.route_id].push(stop as RouteStop);
    }

    setRoutes(
      routeRows.map((r) => ({
        ...r,
        crew: r.crew ?? null,
        stops: stopsByRoute[r.id] ?? [],
      })) as RouteWithCrew[]
    );
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  // Realtime on route status changes
  useEffect(() => {
    const ch = supabase
      .channel('routes-list-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, loadRoutes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, loadRoutes)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadRoutes]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader title="Routes" description="Daily route management and optimization">
        <HowRoutesWorks />
        <Link
          href="/dashboard/routes/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Build Route
        </Link>
      </PageHeader>

      <PageIntro
        id="routes"
        title="Optimized daily routes"
        description="Build a route per crew per day. The Optimize button sequences stops to minimize drive time using VROOM."
        steps={[
          'Click + Build Route, pick a crew + date, then add stops.',
          'Hit Optimize to auto-order stops by shortest total drive.',
          'Active routes update live as crews mark stops complete.',
        ]}
      />

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-5">
        <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => toDateStr(addDays(new Date(`${d}T12:00`), -1)))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => toDateStr(addDays(new Date(`${d}T12:00`), 1)))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(toDateStr(new Date()))}>
          Today
        </Button>
        <span className="text-sm font-semibold ml-1">{formatDateLabel(selectedDate)}</span>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-16">Loading routes…</p>
      )}

      {!loading && routes.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            No routes built for {formatDateLabel(selectedDate).toLowerCase()}
          </p>
          <Link
            href="/dashboard/routes/new"
            className={buttonVariants()}
            style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Build Route
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {routes.map((route) => {
          const isExpanded = expanded.has(route.id);
          const doneCount = route.stops.filter((s) => s.status === 'complete').length;

          return (
            <div key={route.id} className="rounded-xl border bg-card overflow-hidden">
              {/* Route header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {route.crew && (
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: route.crew.color }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/routes/${route.id}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {route.title ?? route.crew?.name ?? 'Unnamed Route'}
                      </Link>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_COLORS[route.status]
                        )}
                      >
                        {route.status.replace('_', ' ')}
                      </span>
                      {route.weather_flag && (
                        <span className="text-xs font-medium text-amber-600">⚠️ Weather</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {route.total_stops ?? route.stops.length} stops
                      </span>
                      {route.total_drive_minutes && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatMinutes(route.total_drive_minutes)} drive
                        </span>
                      )}
                      {route.total_job_minutes && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Timer className="h-3 w-3" />
                          {formatMinutes(route.total_job_minutes)} work
                        </span>
                      )}
                      {doneCount > 0 && (
                        <span className="text-xs text-green-600 font-medium">
                          {doneCount}/{route.stops.length} done
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/dashboard/routes/${route.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}
                  >
                    View
                  </Link>
                  <button
                    onClick={() => toggleExpand(route.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded stop preview */}
              {isExpanded && route.stops.length > 0 && (
                <div className="border-t divide-y">
                  {route.stops.slice(0, 6).map((stop, i) => {
                    const job = stop.job as unknown as {
                      title: string;
                      client: { name: string } | null;
                    } | null;
                    return (
                      <div key={stop.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: route.crew?.color ?? '#3D6B2C' }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {job?.client?.name ?? job?.title ?? '—'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] font-medium capitalize',
                            stop.status === 'complete' ? 'text-green-600' :
                            stop.status === 'en_route' ? 'text-blue-600' :
                            stop.status === 'arrived' ? 'text-amber-600' :
                            'text-muted-foreground'
                          )}
                        >
                          {stop.status}
                        </span>
                      </div>
                    );
                  })}
                  {route.stops.length > 6 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{route.stops.length - 6} more stops
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
