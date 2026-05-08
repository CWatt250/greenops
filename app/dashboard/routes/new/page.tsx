'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { StopList, type StopDraft } from '@/components/routes/stop-list';
import { RouteSummaryBar } from '@/components/routes/route-summary-bar';
import { OptimizeButton } from '@/components/routes/optimize-button';
import { WeatherBanner } from '@/components/routes/weather-banner';
import { AddStopInput } from '@/components/routes/add-stop-input';
import { geocodeAddress, getRouteLegs, getRoutePolyline, type PlaceSuggestion } from '@/lib/mapbox';
import { getWeatherForRoute } from '@/lib/weather';
import { toast } from 'sonner';
import { Loader2, Save, Send, MapPin } from 'lucide-react';
import type { Crew } from '@/types';
import type { MapStop } from '@/components/routes/route-map';

const RouteMap = dynamic(() => import('@/components/routes/route-map'), { ssr: false });

type JobWithClient = {
  id: string;
  title: string;
  status: string;
  scheduled_start?: string | null;
  client: { id: string; name: string; service_address: string } | null;
};

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function RouteBuilderPage() {
  const router = useRouter();
  const supabase = createClient();

  // Auth
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Selectors
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState('');
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [routeTitle, setRouteTitle] = useState('');

  // Stop state
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);

  // Map
  const [polyline, setPolyline] = useState<GeoJSON.LineString | null>(null);

  // Weather
  const [weatherInfo, setWeatherInfo] = useState<{ summary: string; flag: boolean } | null>(null);

  // Loading states
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const geocodeCache = useRef<Map<string, [number, number]>>(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from('profiles').select('company_id').eq('id', user.id).single()
        .then(({ data }) => setCompanyId(data?.company_id ?? null));
    });
    supabase.from('crews').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setCrews((data ?? []) as Crew[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocode a stop address (with local cache)
  const geocodeStop = useCallback(async (address: string): Promise<[number, number] | null> => {
    if (geocodeCache.current.has(address)) {
      return geocodeCache.current.get(address)!;
    }
    const coords = await geocodeAddress(address);
    if (coords) geocodeCache.current.set(address, coords);
    return coords;
  }, []);

  // Rebuild polyline + drive times when stop coords change
  const rebuildRouteGeometry = useCallback(async (currentStops: StopDraft[]) => {
    const geocoded = currentStops.filter((s) => s.lat !== null && s.lng !== null);
    if (geocoded.length < 2) {
      setPolyline(null);
      return currentStops;
    }

    const coords = geocoded.map((s) => ({ lat: s.lat!, lng: s.lng! }));

    const [poly, legs] = await Promise.all([
      getRoutePolyline(coords),
      getRouteLegs(coords),
    ]);

    setPolyline(poly);

    if (!legs) return currentStops;

    let legIdx = 0;
    return currentStops.map((stop, i) => {
      if (i === 0 || stop.lat === null) return { ...stop, drive_minutes_from_prev: 0 };
      const prevGeocoded = currentStops.slice(0, i).some((s) => s.lat !== null);
      if (!prevGeocoded) return { ...stop, drive_minutes_from_prev: 0 };
      const leg = legs[legIdx++];
      return {
        ...stop,
        drive_minutes_from_prev: Math.round((leg?.duration_seconds ?? 0) / 60),
        drive_distance_miles: Math.round(((leg?.distance_meters ?? 0) / 1609.34) * 100) / 100,
      };
    });
  }, []);

  // Auto-load jobs whenever crew + date are both set and companyId is known
  useEffect(() => {
    if (!selectedCrewId || !selectedDate || !companyId) return;

    let cancelled = false;
    (async () => {
      setLoadingJobs(true);
      setAutoLoaded(false);

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, status, scheduled_start, client:clients(id,name,service_address)')
        .eq('crew_id', selectedCrewId)
        .eq('scheduled_date', selectedDate)
        .not('status', 'in', '("cancelled","complete")')
        .order('scheduled_start');

      if (cancelled) return;

      const jobList = (jobs ?? []) as unknown as JobWithClient[];

      const drafted: StopDraft[] = await Promise.all(
        jobList.map(async (job, i) => {
          const address = job.client?.service_address ?? '';
          const coords = address ? await geocodeStop(address) : null;
          return {
            _key: makeKey(),
            job_id: job.id,
            job: job as StopDraft['job'],
            label: null,
            address: null,
            stop_order: i + 1,
            estimated_duration_minutes: 30,
            drive_minutes_from_prev: 0,
            drive_distance_miles: 0,
            lat: coords ? coords[1] : null,
            lng: coords ? coords[0] : null,
          };
        })
      );

      if (cancelled) return;

      const withGeometry = await rebuildRouteGeometry(drafted);
      if (cancelled) return;

      setStops(withGeometry);

      const crew = crews.find((c) => c.id === selectedCrewId);
      if (crew && selectedDate) {
        setRouteTitle(`${crew.name} · ${formatDateLabel(selectedDate)}`);
      }

      setAutoLoaded(true);
      setLoadingJobs(false);
    })();

    return () => { cancelled = true; };
  }, [selectedCrewId, selectedDate, companyId, supabase, geocodeStop, rebuildRouteGeometry, crews]);

  async function handleReorder(reordered: StopDraft[]) {
    const withGeometry = await rebuildRouteGeometry(reordered);
    setStops(withGeometry);
  }

  function handleRemove(key: string) {
    setStops((prev) => {
      const next = prev.filter((s) => s._key !== key).map((s, i) => ({ ...s, stop_order: i + 1 }));
      // re-geocode geometry after removal
      void rebuildRouteGeometry(next).then(setStops);
      return next;
    });
    if (selectedStopKey === key) setSelectedStopKey(null);
  }

  function handleDurationChange(key: string, minutes: number) {
    setStops((prev) =>
      prev.map((s) => (s._key === key ? { ...s, estimated_duration_minutes: minutes } : s))
    );
  }

  function handleOptimized(reorderedStops: StopDraft[]) {
    setStops(reorderedStops);
    setPolyline(null);
    void handleReorder(reorderedStops);
  }

  async function handleAddStop(place: PlaceSuggestion) {
    const newStop: StopDraft = {
      _key: makeKey(),
      job_id: null,
      job: null,
      label: place.shortName,
      address: place.placeName,
      stop_order: stops.length + 1,
      estimated_duration_minutes: 30,
      drive_minutes_from_prev: 0,
      drive_distance_miles: 0,
      lat: place.lat,
      lng: place.lng,
    };
    const next = [...stops, newStop];
    const withGeometry = await rebuildRouteGeometry(next);
    setStops(withGeometry);
    toast.success(`Added stop: ${place.shortName}`);
  }

  async function saveRoute(dispatch = false): Promise<string | null> {
    if (!companyId || !userId || !selectedCrewId || !selectedDate) {
      toast.error('Please select a crew and date.');
      return null;
    }
    if (stops.length === 0) {
      toast.error('Add at least one stop before saving.');
      return null;
    }

    const firstGeo = stops.find((s) => s.lat !== null && s.lng !== null);
    let weather = weatherInfo;
    if (!weather && firstGeo?.lat && firstGeo?.lng) {
      weather = await getWeatherForRoute(firstGeo.lat!, firstGeo.lng!, selectedDate);
      setWeatherInfo(weather);
    }

    const totalDrive = stops.reduce((s, st) => s + (st.drive_minutes_from_prev ?? 0), 0);
    const totalWork = stops.reduce((s, st) => s + (st.estimated_duration_minutes ?? 30), 0);

    const { data: route, error: routeErr } = await supabase
      .from('routes')
      .insert({
        company_id: companyId,
        crew_id: selectedCrewId,
        route_date: selectedDate,
        title: routeTitle || null,
        status: dispatch ? 'active' : 'draft',
        total_drive_minutes: totalDrive,
        total_job_minutes: totalWork,
        total_stops: stops.length,
        weather_checked_at: weather ? new Date().toISOString() : null,
        weather_summary: weather?.summary ?? null,
        weather_flag: weather?.flag ?? false,
        created_by: userId,
      })
      .select('id')
      .single();

    if (routeErr || !route) {
      toast.error(routeErr?.message ?? 'Failed to save route.');
      return null;
    }

    const stopInserts = stops.map((s) => ({
      route_id: route.id,
      job_id: s.job_id,
      label: s.job_id ? null : s.label,
      address: s.job_id ? null : s.address,
      lat: s.job_id ? null : s.lat,
      lng: s.job_id ? null : s.lng,
      stop_order: s.stop_order,
      estimated_duration_minutes: s.estimated_duration_minutes,
      drive_minutes_from_prev: Math.round(s.drive_minutes_from_prev),
      drive_distance_miles: s.drive_distance_miles,
    }));

    const { error: stopsErr } = await supabase.from('route_stops').insert(stopInserts);
    if (stopsErr) {
      toast.error(stopsErr.message);
      return null;
    }

    return route.id;
  }

  async function handleSave() {
    setSaving(true);
    const routeId = await saveRoute(false);
    setSaving(false);
    if (routeId) {
      toast.success('Route saved!');
      router.push(`/dashboard/routes/${routeId}`);
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    const routeId = await saveRoute(true);
    if (!routeId) { setDispatching(false); return; }

    const { data: members } = await supabase
      .from('crew_members')
      .select('profile_id')
      .eq('crew_id', selectedCrewId);

    if (members?.length && companyId) {
      await supabase.from('notifications').insert(
        members.map((m: { profile_id: string }) => ({
          company_id: companyId,
          profile_id: m.profile_id,
          title: `Route dispatched: ${routeTitle || 'Today\'s route'}`,
          body: `${stops.length} stops · ${formatDateLabel(selectedDate)}`,
          entity_type: 'route',
          entity_id: routeId,
        }))
      );
    }

    toast.success('Route dispatched to crew!');
    setDispatching(false);
    router.push(`/dashboard/routes/${routeId}`);
  }

  const selectedCrew = crews.find((c) => c.id === selectedCrewId);
  const crewColor = selectedCrew?.color ?? 'var(--orange)';

  const mapStops: MapStop[] = stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({
      id: s._key,
      lat: s.lat!,
      lng: s.lng!,
      order: s.stop_order,
      label: s.job_id
        ? ((s.job?.client as { name: string } | null)?.name ?? s.job?.title ?? 'Stop')
        : (s.label ?? 'Custom stop'),
      color: crewColor,
      isSelected: s._key === selectedStopKey,
    }));

  // Empty state shown after auto-load returns no jobs
  const emptyState = (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--orange-soft)] mb-3">
        <MapPin className="h-5 w-5" style={{ color: 'var(--orange)' }} />
      </div>
      <p className="text-sm font-semibold mb-1">
        No jobs scheduled
      </p>
      <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
        {selectedCrew
          ? <>No jobs for <span className="font-medium text-foreground">{selectedCrew.name}</span> on {formatDateLabel(selectedDate)}.</>
          : <>No jobs found for {formatDateLabel(selectedDate)}.</>}
        {' '}Assign jobs in <span className="font-medium text-foreground">Jobs</span> or <span className="font-medium text-foreground">Schedule</span>, or add stops manually below.
      </p>
    </div>
  );

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[400px] shrink-0 flex flex-col border-r bg-background overflow-hidden">

        {/* Top: date + crew + title */}
        <div className="p-4 border-b space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs mb-1 block">Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-xs mb-1 block">Crew</Label>
              <Select value={selectedCrewId} onValueChange={(v) => setSelectedCrewId(v ?? '')}>
                <SelectTrigger className="h-8 text-sm w-full" aria-label="Select crew">
                  {selectedCrew ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedCrew.color }}
                      />
                      <span className="truncate">{selectedCrew.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select crew…</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {crews.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No active crews.</div>
                  )}
                  {crews.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
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
          <div>
            <Label className="text-xs mb-1 block">Route Title</Label>
            <Input
              placeholder="e.g. Crew Alpha · Mon May 8"
              value={routeTitle}
              onChange={(e) => setRouteTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0 flex-wrap">
          <OptimizeButton
            stops={stops}
            onOptimized={handleOptimized}
            disabled={loadingJobs}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving || dispatching || stops.length === 0}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            onClick={handleDispatch}
            disabled={saving || dispatching || stops.length === 0}
            className="gap-1.5"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Dispatch
          </Button>
        </div>

        {/* Weather banner */}
        {weatherInfo?.flag && (
          <WeatherBanner summary={weatherInfo.summary} />
        )}

        {/* Stop list — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingJobs ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border bg-card p-3 animate-pulse flex gap-2">
                  <div className="h-6 w-6 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-2 w-48 bg-muted/70 rounded" />
                    <div className="h-2 w-24 bg-muted/50 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <StopList
                stops={stops}
                crewColor={crewColor}
                selectedStopId={selectedStopKey}
                onReorder={handleReorder}
                onRemove={handleRemove}
                onDurationChange={handleDurationChange}
                onStopSelect={setSelectedStopKey}
                emptyState={
                  selectedCrewId && autoLoaded ? emptyState : undefined
                }
              />
              {selectedCrewId && (
                <AddStopInput onAdd={handleAddStop} crewColor={crewColor} />
              )}
            </>
          )}
        </div>

        {/* Summary bar — fixed to bottom */}
        <RouteSummaryBar stops={stops} />
      </div>

      {/* ─── RIGHT PANEL — MAP ─── */}
      <div className="flex-1 relative">
        <RouteMap
          stops={mapStops}
          polyline={polyline}
          crewColor={crewColor}
          selectedStopId={selectedStopKey}
          onStopClick={(id) =>
            setSelectedStopKey((prev) => (prev === id ? null : id))
          }
        />
        {!selectedCrewId && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm pointer-events-none">
            <p className="text-sm font-medium text-foreground bg-background rounded-lg px-4 py-2.5 shadow border">
              Select a crew to build the route
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
