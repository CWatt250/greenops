'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StopList, type StopDraft } from '@/components/routes/stop-list';
import { RouteSummaryBar } from '@/components/routes/route-summary-bar';
import { WeatherBanner } from '@/components/routes/weather-banner';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { getRoutePolyline } from '@/lib/mapbox';
import {
  ChevronLeft, Loader2, Edit, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route, RouteStop, Crew, StopStatus } from '@/types';
import type { MapStop } from '@/components/routes/route-map';

const RouteMap = dynamic(() => import('@/components/routes/route-map'), { ssr: false });

type RouteDetail = Route & { crew: Crew | null };
type StopWithJob = RouteStop & {
  job: {
    id: string;
    title: string;
    client: { name: string; service_address: string } | null;
  } | null;
};

function stopAddress(s: StopWithJob): string {
  return s.job?.client?.service_address ?? s.address ?? '';
}

function stopLabel(s: StopWithJob): string {
  return s.job
    ? (s.job.client?.name ?? s.job.title ?? 'Stop')
    : (s.label ?? 'Custom stop');
}

const STOP_STATUS_COLORS: Record<StopStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  en_route: 'bg-blue-100 text-blue-700',
  arrived: 'bg-amber-100 text-amber-700',
  complete: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-400 line-through',
};

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [stops, setStops] = useState<StopWithJob[]>([]);
  const [polyline, setPolyline] = useState<GeoJSON.LineString | null>(null);
  const [crewLocation, setCrewLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [routeRes, stopsRes] = await Promise.all([
      supabase
        .from('routes')
        .select('*, crew:crews(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('route_stops')
        .select('*, label, address, lat, lng, job:jobs(id,title,client:clients(name,service_address))')
        .eq('route_id', id)
        .order('stop_order'),
    ]);

    if (routeRes.data) setRoute(routeRes.data as RouteDetail);
    const stopList = (stopsRes.data ?? []) as unknown as StopWithJob[];
    setStops(stopList);

    // Build polyline. Use stored lat/lng for ad-hoc stops; geocode jobs.
    const { geocodeAddress } = await import('@/lib/mapbox');
    const allCoords = await Promise.all(
      stopList.map(async (s) => {
        if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
        const addr = stopAddress(s);
        if (!addr) return null;
        const c = await geocodeAddress(addr);
        return c ? { lat: c[1], lng: c[0] } : null;
      })
    );
    const geoCoords = allCoords.filter((c): c is { lat: number; lng: number } => c !== null);
    if (geoCoords.length >= 2) {
      const poly = await getRoutePolyline(geoCoords);
      setPolyline(poly);
    }

    // Get latest GPS position for crew members on this route's jobs today
    if (routeRes.data?.crew_id) {
      const { data: crewMembers } = await supabase
        .from('crew_members')
        .select('profile_id')
        .eq('crew_id', routeRes.data.crew_id);

      if (crewMembers?.length) {
        const profileIds = crewMembers.map((m: { profile_id: string }) => m.profile_id);
        const { data: latestClock } = await supabase
          .from('clock_events')
          .select('latitude, longitude')
          .in('profile_id', profileIds)
          .not('latitude', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestClock?.latitude && latestClock?.longitude) {
          setCrewLocation({
            lat: latestClock.latitude,
            lng: latestClock.longitude,
          });
        }
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime subscription on route_stops
  useEffect(() => {
    const ch = supabase
      .channel(`route-detail-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_stops', filter: `route_id=eq.${id}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clock_events' },
        () => loadAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, loadAll]);

  const crewColor = route?.crew?.color ?? '#3D6B2C';

  // Build map stops by geocoding on the fly from loaded stop data
  // (re-use the same geocode cache approach)
  const mapStops: MapStop[] = [];
  // We'll populate these lazily via a separate effect after initial render

  const [geoStops, setGeoStops] = useState<MapStop[]>([]);

  useEffect(() => {
    if (stops.length === 0) return;
    let cancelled = false;
    async function geo() {
      const { geocodeAddress } = await import('@/lib/mapbox');
      const results: MapStop[] = [];
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        let lat = stop.lat ?? null;
        let lng = stop.lng ?? null;
        if (lat == null || lng == null) {
          const addr = stopAddress(stop);
          if (!addr) continue;
          const coords = await geocodeAddress(addr);
          if (!coords || cancelled) continue;
          lng = coords[0];
          lat = coords[1];
        }
        results.push({
          id: stop.id,
          lat,
          lng,
          order: stop.stop_order,
          label: stopLabel(stop),
          color: crewColor,
          isSelected: stop.id === selectedStopId,
          status: stop.status,
        });
      }
      if (!cancelled) setGeoStops(results);
    }
    geo();
    return () => { cancelled = true; };
  }, [stops, crewColor, selectedStopId]);

  // Convert RouteStop → StopDraft for StopList (read-only)
  const stopDrafts: StopDraft[] = stops.map((s) => ({
    _key: s.id,
    job_id: s.job_id,
    job: s.job ?? null,
    label: s.label ?? null,
    address: s.address ?? null,
    stop_order: s.stop_order,
    estimated_duration_minutes: s.estimated_duration_minutes ?? 30,
    drive_minutes_from_prev: s.drive_minutes_from_prev ?? 0,
    drive_distance_miles: s.drive_distance_miles ?? 0,
    lat: geoStops.find((g) => g.id === s.id)?.lat ?? s.lat ?? null,
    lng: geoStops.find((g) => g.id === s.id)?.lng ?? s.lng ?? null,
  }));

  const remaining = stops.filter((s) => s.status !== 'complete' && s.status !== 'skipped').length;

  if (loading) {
    return (
      <div
        className="-m-4 md:-m-6 lg:-m-8 flex items-center justify-center"
        style={{ height: 'calc(100svh - 3.5rem)' }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!route) {
    return <p className="text-sm text-muted-foreground text-center py-16">Route not found.</p>;
  }

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[400px] shrink-0 flex flex-col border-r bg-background overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b shrink-0">
          <Link
            href="/dashboard/routes"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Routes
          </Link>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">
                {route.title ?? route.crew?.name ?? 'Unnamed Route'}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    {
                      draft: 'bg-gray-100 text-gray-600',
                      active: 'bg-blue-100 text-blue-700',
                      in_progress: 'bg-amber-100 text-amber-700',
                      complete: 'bg-green-100 text-green-700',
                    }[route.status]
                  )}
                >
                  {route.status.replace('_', ' ')}
                </span>
                {remaining > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {remaining} stop{remaining !== 1 ? 's' : ''} remaining
                  </span>
                )}
                {remaining === 0 && stops.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> All complete
                  </span>
                )}
              </div>
            </div>
            {(route.status === 'draft' || route.status === 'active') && (
              <Link
                href={`/dashboard/routes/${id}/edit`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Weather banner */}
        {route.weather_flag && route.weather_summary && (
          <WeatherBanner summary={route.weather_summary} routeId={route.id} />
        )}

        {/* Stop list — scrollable, read-only */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Status legend */}
          <div className="px-3 pt-3 pb-1 flex flex-wrap gap-2">
            {(['pending', 'en_route', 'arrived', 'complete'] as StopStatus[]).map((s) => (
              <span
                key={s}
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                  STOP_STATUS_COLORS[s]
                )}
              >
                {s.replace('_', ' ')}
              </span>
            ))}
          </div>

          <StopList
            stops={stopDrafts}
            crewColor={crewColor}
            selectedStopId={selectedStopId}
            onReorder={() => {}}
            onRemove={() => {}}
            onDurationChange={() => {}}
            onStopSelect={setSelectedStopId}
            readonly
          />
        </div>

        {/* Summary bar */}
        <RouteSummaryBar stops={stopDrafts} />
      </div>

      {/* ─── RIGHT PANEL — LIVE MAP ─── */}
      <div className="flex-1 relative">
        <RouteMap
          stops={geoStops.map((s) => ({
            ...s,
            isSelected: s.id === selectedStopId,
          }))}
          polyline={polyline}
          crewColor={crewColor}
          selectedStopId={selectedStopId}
          onStopClick={(stopId) =>
            setSelectedStopId((prev) => (prev === stopId ? null : stopId))
          }
          crewLocation={crewLocation}
        />

        {/* Live crew indicator */}
        {crewLocation && (
          <div className="absolute top-3 left-3 rounded-lg bg-background/90 backdrop-blur-sm px-3 py-2 text-xs font-medium shadow flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ backgroundColor: crewColor }}
            />
            Crew live
          </div>
        )}

        {/* Route date */}
        <div className="absolute bottom-3 left-3 rounded-lg bg-background/90 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground shadow">
          {new Date(`${route.route_date}T12:00`).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        </div>
      </div>
    </div>
  );
}
