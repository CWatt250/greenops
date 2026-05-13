'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StopList, type StopDraft } from '@/components/routes/stop-list';
import { GroupedStopList } from '@/components/routes/grouped-stop-list';
import { RouteSummaryBar } from '@/components/routes/route-summary-bar';
import { OptimizeButton } from '@/components/routes/optimize-button';
import { WeatherBanner } from '@/components/routes/weather-banner';
import { AddStopInput } from '@/components/routes/add-stop-input';
import { CrewMultiPicker } from '@/components/routes/crew-multi-picker';
import { JobPickerSheet, type PickerJob } from '@/components/routes/job-picker-sheet';
import {
  geocodeAddress, getRouteLegs, getRoutePolyline, type PlaceSuggestion,
} from '@/lib/mapbox';
import {
  optimizeMultiCrewRoute,
  resolveJobDurationMinutes,
  routeCentroid,
  timeOfDayToEpochSeconds,
  type VroomStop,
} from '@/lib/vroom';
import { getWeatherForRoute } from '@/lib/weather';
import { toast } from 'sonner';
import { Loader2, Save, Send, MapPin, Sparkles, ListChecks } from 'lucide-react';
import type { Crew } from '@/types';
import type { MapStop, MapPolyline, MapLegendItem } from '@/components/routes/route-map';

const RouteMap = dynamic(() => import('@/components/routes/route-map'), { ssr: false });

const TRI_CITIES_DEFAULT: [number, number] = [-119.1734, 46.2087];
const UNASSIGNED_COLOR = '#9CA3AF'; // gray-400

type JobWithClient = {
  id: string;
  title: string;
  status: string;
  crew_id: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  estimated_duration_minutes?: number | null;
  client: {
    id: string;
    name: string;
    service_address: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  line_items?: Array<{
    service: {
      estimated_duration_minutes?: number | null;
      category?: string | null;
    } | null;
  }> | null;
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

function formatMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RouteBuilderPage() {
  const router = useRouter();
  const supabase = createClient();

  // Auth + company
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [officeCoords, setOfficeCoords] = useState<[number, number] | null>(null);

  // Selectors
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [routeTitle, setRouteTitle] = useState('');

  // Stops
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [optimized, setOptimized] = useState(false);

  // Polylines: keyed by crew_id (or 'single' in single-crew mode).
  const [polylinesByGroup, setPolylinesByGroup] = useState<Record<string, GeoJSON.LineString>>({});

  // Weather
  const [weatherInfo, setWeatherInfo] = useState<{ summary: string; flag: boolean } | null>(null);

  // Loading states
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [optimizingMulti, setOptimizingMulti] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  // Picker-driven flow: when true, the auto-load useEffect skips and the
  // user assembles stops by clicking "+ Choose Jobs for This Route". One-shot
  // "Or auto-load…" link below the picker button flips this to false.
  const [pickerMode, setPickerMode] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const geocodeCache = useRef<Map<string, [number, number]>>(new Map());

  const mode: 'single' | 'multi' = selectedCrewIds.length <= 1 ? 'single' : 'multi';
  const crewById = useMemo(() => {
    const m = new Map<string, Crew>();
    crews.forEach((c) => m.set(c.id, c));
    return m;
  }, [crews]);

  // ── Bootstrapping ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (data?.company_id) {
        setCompanyId(data.company_id);
        // Prefer the company's locked depot coords (migration 038). Fall back
        // to geocoding the address if depot_latitude/longitude aren't set yet.
        const { data: company } = await supabase
          .from('companies')
          .select('address, city, state, zip, depot_latitude, depot_longitude')
          .eq('id', data.company_id)
          .single();
        const depotLat = company?.depot_latitude;
        const depotLng = company?.depot_longitude;
        if (Number.isFinite(depotLng) && Number.isFinite(depotLat)) {
          setOfficeCoords([Number(depotLng), Number(depotLat)]);
        } else if (company?.address) {
          const full = [company.address, company.city, company.state, company.zip]
            .filter(Boolean)
            .join(', ');
          const coords = await geocodeAddress(full);
          if (coords) setOfficeCoords(coords);
        }
      }
    });
    supabase.from('crews').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setCrews((data ?? []) as Crew[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Geocoding helpers ──────────────────────────────────────────────────
  const geocodeStop = useCallback(async (address: string): Promise<[number, number] | null> => {
    if (geocodeCache.current.has(address)) return geocodeCache.current.get(address)!;
    const coords = await geocodeAddress(address);
    if (coords) geocodeCache.current.set(address, coords);
    return coords;
  }, []);

  // Build polylines + drive-times. Per-crew when grouped, single when not.
  const rebuildGeometry = useCallback(async (currentStops: StopDraft[], multi: boolean) => {
    if (!multi) {
      const geocoded = currentStops.filter((s) => s.lat !== null && s.lng !== null);
      if (geocoded.length < 2) {
        setPolylinesByGroup({});
        return currentStops.map((s) => ({ ...s, drive_minutes_from_prev: 0 }));
      }
      const coords = geocoded.map((s) => ({ lat: s.lat!, lng: s.lng! }));
      const [poly, legs] = await Promise.all([
        getRoutePolyline(coords),
        getRouteLegs(coords),
      ]);
      setPolylinesByGroup(poly ? { single: poly } : {});
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
    }

    // Multi-crew: one polyline + leg set per crew.
    const polylines: Record<string, GeoJSON.LineString> = {};
    const next = [...currentStops];

    // Group by assigned_crew_id, then sort by stop_order
    const byCrew = new Map<string, StopDraft[]>();
    for (const stop of currentStops) {
      const cid = stop.assigned_crew_id;
      if (!cid || stop.lat === null || stop.lng === null) continue;
      if (!byCrew.has(cid)) byCrew.set(cid, []);
      byCrew.get(cid)!.push(stop);
    }

    await Promise.all(
      Array.from(byCrew.entries()).map(async ([cid, crewStops]) => {
        const sorted = [...crewStops].sort((a, b) => a.stop_order - b.stop_order);
        if (sorted.length < 2) return;
        const coords = sorted.map((s) => ({ lat: s.lat!, lng: s.lng! }));
        const [poly, legs] = await Promise.all([
          getRoutePolyline(coords),
          getRouteLegs(coords),
        ]);
        if (poly) polylines[cid] = poly;

        if (legs) {
          let legIdx = 0;
          for (let i = 0; i < sorted.length; i++) {
            const idx = next.findIndex((s) => s._key === sorted[i]._key);
            if (idx < 0) continue;
            if (i === 0) {
              next[idx] = { ...next[idx], drive_minutes_from_prev: 0 };
            } else {
              const leg = legs[legIdx++];
              next[idx] = {
                ...next[idx],
                drive_minutes_from_prev: Math.round((leg?.duration_seconds ?? 0) / 60),
                drive_distance_miles: Math.round(((leg?.distance_meters ?? 0) / 1609.34) * 100) / 100,
              };
            }
          }
        }
      })
    );

    setPolylinesByGroup(polylines);
    return next;
  }, []);

  // ── Auto-load jobs whenever crews + date change ────────────────────────
  // Picker mode is the default; auto-load only fires when the user clicks
  // the "Or auto-load all jobs scheduled for [date]" link below the picker
  // button. This keeps the route builder from blowing away whatever the
  // user is hand-curating just because they switched the date.
  useEffect(() => {
    if (pickerMode) return;
    if (selectedCrewIds.length === 0 || !selectedDate || !companyId) {
      setStops([]);
      setPolylinesByGroup({});
      setOptimized(false);
      setAutoLoaded(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingJobs(true);
      setAutoLoaded(false);
      setOptimized(false);

      // Pull jobs assigned to the selected crews + jobs that are unassigned.
      // .in() doesn't match nulls, so we issue both queries in parallel and merge.
      const baseSelect =
        'id, title, status, crew_id, scheduled_date, scheduled_start, scheduled_end, ' +
        'estimated_duration_minutes, time_window_start, time_window_end, ' +
        'client:clients(id,name,service_address,latitude,longitude), ' +
        'line_items:job_line_items(service:services(estimated_duration_minutes,category))';
      const [assignedRes, unassignedRes] = await Promise.all([
        supabase
          .from('jobs')
          .select(baseSelect)
          .in('crew_id', selectedCrewIds)
          .eq('scheduled_date', selectedDate)
          .not('status', 'in', '("cancelled","complete")')
          .order('scheduled_start'),
        supabase
          .from('jobs')
          .select(baseSelect)
          .is('crew_id', null)
          .eq('scheduled_date', selectedDate)
          .not('status', 'in', '("cancelled","complete")')
          .order('scheduled_start'),
      ]);

      if (cancelled) return;
      const jobList = ([
        ...(assignedRes.data ?? []),
        ...(unassignedRes.data ?? []),
      ]) as unknown as JobWithClient[];

      const isMulti = selectedCrewIds.length > 1;

      // Per-crew local stop_order so each crew's polyline is sequenced
      // correctly. In single-crew mode we still use a global order.
      const orderByCrew = new Map<string, number>();
      function nextOrderFor(crewId: string | null): number {
        const k = crewId ?? '__unassigned';
        const n = (orderByCrew.get(k) ?? 0) + 1;
        orderByCrew.set(k, n);
        return n;
      }

      const drafted: StopDraft[] = await Promise.all(
        jobList.map(async (job, i) => {
          // Prefer stored client lat/lng (set by import / measurement / address
          // autocomplete). Fall back to live Mapbox geocoding only when the
          // client row has no cached coordinates yet.
          const storedLat = job.client?.latitude;
          const storedLng = job.client?.longitude;
          const hasStored =
            typeof storedLat === 'number' && typeof storedLng === 'number'
            && Number.isFinite(storedLat) && Number.isFinite(storedLng);
          let lat: number | null = hasStored ? storedLat as number : null;
          let lng: number | null = hasStored ? storedLng as number : null;
          if (!hasStored) {
            const address = job.client?.service_address ?? '';
            const coords = address ? await geocodeStop(address) : null;
            if (coords) {
              lng = coords[0];
              lat = coords[1];
            }
          }

          // Multi-crew: pre-populate with the job's existing crew assignment
          // so each crew's currently-assigned jobs render in their colour
          // immediately, without waiting on Optimize. Single mode stays as
          // before — every stop maps to the one selected crew.
          const initialCrew = isMulti
            ? (job.crew_id ?? null)
            : selectedCrewIds[0];
          const durationMinutes = resolveJobDurationMinutes(job, {
            jobId: job.id,
            jobTitle: job.title,
          });
          return {
            _key: makeKey(),
            job_id: job.id,
            job: job as StopDraft['job'],
            label: null,
            address: null,
            stop_order: isMulti ? nextOrderFor(initialCrew) : i + 1,
            estimated_duration_minutes: durationMinutes,
            drive_minutes_from_prev: 0,
            drive_distance_miles: 0,
            lat,
            lng,
            assigned_crew_id: initialCrew,
          };
        })
      );

      if (cancelled) return;

      const withGeometry = await rebuildGeometry(drafted, isMulti);
      if (cancelled) return;

      setStops(withGeometry);

      // Auto-title (single-crew only)
      if (!isMulti && selectedCrewIds[0]) {
        const crew = crewById.get(selectedCrewIds[0]);
        if (crew) setRouteTitle(`${crew.name} · ${formatDateLabel(selectedDate)}`);
      } else {
        setRouteTitle('');
      }

      setAutoLoaded(true);
      setLoadingJobs(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrewIds.join(','), selectedDate, companyId, crewById, pickerMode]);

  // ── Single-crew handlers ───────────────────────────────────────────────
  async function handleReorderSingle(reordered: StopDraft[]) {
    const withGeometry = await rebuildGeometry(reordered, false);
    setStops(withGeometry);
  }

  function handleRemove(key: string) {
    setStops((prev) => {
      const next = prev.filter((s) => s._key !== key).map((s, i) => ({ ...s, stop_order: i + 1 }));
      void rebuildGeometry(next, mode === 'multi').then(setStops);
      return next;
    });
    if (selectedStopKey === key) setSelectedStopKey(null);
  }

  function handleDurationChange(key: string, minutes: number) {
    setStops((prev) =>
      prev.map((s) => (s._key === key ? { ...s, estimated_duration_minutes: minutes } : s))
    );
  }

  function handleOptimizedSingle(reorderedStops: StopDraft[]) {
    setStops(reorderedStops);
    setPolylinesByGroup({});
    void handleReorderSingle(reorderedStops);
  }

  /**
   * Inline crew reassignment from a stop card in multi-crew mode.
   * The CrewAssignSelect already wrote to Supabase by the time we get here;
   * we just update local state, renumber stop_order per crew, and rebuild
   * polylines. Used in multi mode only — single mode bypasses this.
   */
  async function handleStopCrewChange(stopKey: string, newCrewId: string | null) {
    // Compute next state synchronously, then rebuild geometry with it.
    const next = stops.map((s) => (
      s._key === stopKey ? { ...s, assigned_crew_id: newCrewId } : s
    ));
    // Renumber stop_order within each crew (1..N) based on existing order.
    const counters = new Map<string, number>();
    const renumbered: StopDraft[] = next.map((s) => {
      const k = s.assigned_crew_id ?? '__unassigned';
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return { ...s, stop_order: n };
    });
    const withGeometry = await rebuildGeometry(renumbered, mode === 'multi');
    setStops(withGeometry);
  }

  // Picker-driven add: convert each chosen job into a StopDraft, geocoding
  // any without cached client coords. Skips duplicates already on the route.
  async function handleAddJobsFromPicker(picked: PickerJob[]) {
    if (picked.length === 0) return;
    const existing = new Set(stops.map((s) => s.job_id).filter((id): id is string => !!id));
    const fresh = picked.filter((j) => !existing.has(j.id));
    if (fresh.length === 0) {
      toast.message('All picked jobs are already on the route.');
      return;
    }

    const isMulti = selectedCrewIds.length > 1;
    const orderByCrew = new Map<string, number>();
    function nextOrderFor(crewId: string | null): number {
      const k = crewId ?? '__unassigned';
      const n = (orderByCrew.get(k) ?? 0) + 1;
      orderByCrew.set(k, n);
      return n;
    }
    // Seed the per-crew counters with whatever's already on the route so
    // newly picked jobs append rather than collide.
    for (const s of stops) {
      const k = s.assigned_crew_id ?? '__unassigned';
      orderByCrew.set(k, Math.max(orderByCrew.get(k) ?? 0, s.stop_order));
    }
    let globalCounter = stops.length;

    const drafted: StopDraft[] = await Promise.all(
      fresh.map(async (job) => {
        const storedLat = job.client?.latitude;
        const storedLng = job.client?.longitude;
        const hasStored =
          typeof storedLat === 'number' && typeof storedLng === 'number'
          && Number.isFinite(storedLat) && Number.isFinite(storedLng);
        let lat: number | null = hasStored ? (storedLat as number) : null;
        let lng: number | null = hasStored ? (storedLng as number) : null;
        if (!hasStored && job.client?.service_address) {
          const coords = await geocodeStop(job.client.service_address);
          if (coords) {
            lng = coords[0];
            lat = coords[1];
          }
        }
        const initialCrew = isMulti ? (job.crew_id ?? null) : (selectedCrewIds[0] ?? null);
        const durationMinutes = resolveJobDurationMinutes(job, {
          jobId: job.id,
          jobTitle: job.title,
        });
        return {
          _key: makeKey(),
          job_id: job.id,
          job: job as unknown as StopDraft['job'],
          label: null,
          address: null,
          stop_order: isMulti ? nextOrderFor(initialCrew) : ++globalCounter,
          estimated_duration_minutes: durationMinutes,
          drive_minutes_from_prev: 0,
          drive_distance_miles: 0,
          lat,
          lng,
          assigned_crew_id: initialCrew,
        };
      }),
    );

    const next = [...stops, ...drafted];
    const withGeometry = await rebuildGeometry(next, isMulti);
    setStops(withGeometry);
    toast.success(`Added ${drafted.length} job${drafted.length === 1 ? '' : 's'} to the route.`);
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
      assigned_crew_id: mode === 'single' ? selectedCrewIds[0] ?? null : null,
    };
    const next = [...stops, newStop];
    const withGeometry = await rebuildGeometry(next, mode === 'multi');
    setStops(withGeometry);
    toast.success(`Added stop: ${place.shortName}`);
  }

  // ── Multi-crew optimize ────────────────────────────────────────────────
  async function handleOptimizeMulti() {
    if (selectedCrewIds.length < 2) {
      toast.error('Multi-crew optimize requires 2+ crews.');
      return;
    }

    const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null);
    const ungeocoded = stops.filter((s) => s.lat === null || s.lng === null);

    // Pre-flight: log everything so the browser console shows the full picture.
    // eslint-disable-next-line no-console
    console.log('[optimize] geocoded stops:', geocodedStops.map((s) => ({
      key: s._key,
      job_id: s.job_id,
      address:
        (s.job?.client as { service_address?: string } | null | undefined)?.service_address
        ?? s.address ?? '(no address)',
      coords: [s.lng, s.lat],
      duration_min: s.estimated_duration_minutes,
    })));
    if (ungeocoded.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[optimize] stops with no coords (will be skipped):',
        ungeocoded.map((s) => (
          (s.job?.client as { service_address?: string } | null | undefined)?.service_address
          ?? s.address ?? '(no address)'
        )));
    }

    if (geocodedStops.length === 0) {
      toast.error(
        ungeocoded.length > 0
          ? `0 of ${stops.length} stops have coordinates — Mapbox geocoding may have failed (check NEXT_PUBLIC_MAPBOX_TOKEN). See console for the address list.`
          : 'No stops to optimize.'
      );
      return;
    }

    setOptimizingMulti(true);

    const toastId = toast.loading(`Calling VROOM API… (${geocodedStops.length} stops × ${selectedCrewIds.length} crews)`);

    // Depot: company office > centroid > Tri-Cities default.
    const startLocation: [number, number] = officeCoords
      ?? routeCentroid(geocodedStops.map((s) => [s.lng!, s.lat!] as [number, number]))
      ?? TRI_CITIES_DEFAULT;

    // eslint-disable-next-line no-console
    console.log('[optimize] depot:', startLocation, officeCoords ? '(company office)' : '(fallback)');

    const vroomStops: VroomStop[] = geocodedStops.map((s, i) => {
      const stop: VroomStop = {
        id: i,
        location: [s.lng!, s.lat!],
        service: (s.estimated_duration_minutes ?? 30) * 60,
      };
      // Per-job time window from the underlying jobs row (migration 041).
      // Both bounds must be present; otherwise ORS rejects the payload.
      const jobAny = s.job as unknown as
        | { time_window_start?: string | null; time_window_end?: string | null }
        | null;
      const tws = jobAny?.time_window_start;
      const twe = jobAny?.time_window_end;
      if (tws && twe) {
        const startEpoch = timeOfDayToEpochSeconds(selectedDate, tws);
        const endEpoch = timeOfDayToEpochSeconds(selectedDate, twe);
        if (startEpoch !== null && endEpoch !== null && endEpoch > startEpoch) {
          stop.time_window = [startEpoch, endEpoch];
        }
      }
      return stop;
    });

    // Audit log — surfaces the exact per-job constraints VROOM will see.
    // Mode A jobs render with no time_window; Mode B/C render with one.
    // eslint-disable-next-line no-console
    console.log('[optimize] VROOM stops:', vroomStops.map((s) => ({
      id: s.id,
      service_min: Math.round(s.service / 60),
      time_window: s.time_window
        ? `${new Date(s.time_window[0] * 1000).toLocaleTimeString()}` +
          `–${new Date(s.time_window[1] * 1000).toLocaleTimeString()}`
        : '— (anytime)',
    })));

    const crewVehicles = selectedCrewIds.map((id) => ({ crew_id: id }));

    const origDrive = stops.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);

    const outcome = await optimizeMultiCrewRoute(
      vroomStops,
      crewVehicles,
      startLocation,
      { routeDate: selectedDate },
    );

    if (!outcome.ok) {
      setOptimizingMulti(false);
      toast.dismiss(toastId);
      // eslint-disable-next-line no-console
      console.error('[optimize] failed:', outcome.error, outcome.status ? `(status ${outcome.status})` : '');
      toast.error(`VROOM optimization failed — ${outcome.error}`);
      return;
    }

    const result = outcome.result;

    // Build a map of stop._key → assigned crew + per-crew order
    const assignmentByKey = new Map<string, { crew_id: string; order: number }>();
    for (const a of result.assignments) {
      a.stop_ids.forEach((vroomId, position) => {
        const sourceStop = geocodedStops[vroomId];
        if (sourceStop) {
          assignmentByKey.set(sourceStop._key, {
            crew_id: a.crew_id,
            order: position + 1,
          });
        }
      });
    }

    // Apply assignments back to the full stop list
    const reassigned: StopDraft[] = stops.map((s) => {
      const a = assignmentByKey.get(s._key);
      if (a) {
        return { ...s, assigned_crew_id: a.crew_id, stop_order: a.order };
      }
      if (s.lat === null || s.lng === null) return { ...s, assigned_crew_id: null };
      return { ...s, assigned_crew_id: null };
    });

    const withGeometry = await rebuildGeometry(reassigned, true);
    setStops(withGeometry);
    setOptimized(true);
    setOptimizingMulti(false);
    toast.dismiss(toastId);

    const newDrive = withGeometry.reduce((sum, s) => sum + (s.drive_minutes_from_prev ?? 0), 0);
    const saved = Math.max(0, Math.round(origDrive - newDrive));

    const totalAssigned = result.assignments.reduce((s, a) => s + a.stop_ids.length, 0);

    // Build a per-crew breakdown for the toast: "Crew 1: 4 stops · 32m drive".
    const crewLines = result.assignments
      .filter((a) => a.stop_ids.length > 0)
      .map((a) => {
        const name = crews.find((c) => c.id === a.crew_id)?.name ?? 'Crew';
        const driveMin = Math.round(a.duration_seconds / 60);
        return `${name}: ${a.stop_ids.length} stop${a.stop_ids.length === 1 ? '' : 's'} · ${driveMin}m drive`;
      });
    // "Saved" = the worst single-crew tour minus the average — i.e. how much
    // drive time we shed by spreading instead of stacking onto one crew.
    const durations = result.assignments
      .filter((a) => a.stop_ids.length > 0)
      .map((a) => a.duration_seconds);
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const avgDuration = durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;
    const balancedSavedMin = Math.round((maxDuration - avgDuration) / 60);

    if (totalAssigned === 0) {
      toast.warning('VROOM returned no assignments. Check console for the response — usually means the depot is too far from the stops.');
    } else {
      const description = [
        ...crewLines,
        ...(balancedSavedMin > 0 ? [`Total saved: ~${balancedSavedMin}m vs unbalanced`] : []),
        ...(saved > 0 ? [`Drive time vs original: -${formatMinutes(saved)}`] : []),
      ].join('\n');
      toast.success('Routes optimized', { description, duration: 6000 });
    }

    if (result.unassigned.length > 0) {
      toast.warning(
        `${result.unassigned.length} stop${result.unassigned.length === 1 ? '' : 's'} couldn't fit any crew — left unassigned.`
      );
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────
  async function saveRoute(dispatch = false): Promise<{ ids: string[]; titles: string[] } | null> {
    if (!companyId || !userId || selectedCrewIds.length === 0 || !selectedDate) {
      toast.error('Please select at least one crew and a date.');
      return null;
    }
    if (stops.length === 0) {
      toast.error('Add at least one stop before saving.');
      return null;
    }

    if (mode === 'multi') {
      const anyAssigned = stops.some((s) => !!s.assigned_crew_id);
      if (!anyAssigned) {
        toast.error('No stops are assigned yet. Click ✨ Optimize Routes or assign crews inline first.');
        return null;
      }
    }

    // Weather check using first geocoded stop
    const firstGeo = stops.find((s) => s.lat !== null && s.lng !== null);
    let weather = weatherInfo;
    if (!weather && firstGeo?.lat && firstGeo?.lng) {
      weather = await getWeatherForRoute(firstGeo.lat!, firstGeo.lng!, selectedDate);
      setWeatherInfo(weather);
    }

    // Build groups: one entry per crew with assigned stops.
    const groups = new Map<string, StopDraft[]>();
    for (const cid of selectedCrewIds) groups.set(cid, []);
    for (const stop of stops) {
      const cid = stop.assigned_crew_id;
      if (!cid) continue;
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid)!.push(stop);
    }

    const createdIds: string[] = [];
    const createdTitles: string[] = [];

    for (const [cid, crewStops] of groups.entries()) {
      if (crewStops.length === 0) continue;

      const ordered = [...crewStops].sort((a, b) => a.stop_order - b.stop_order);
      const crew = crewById.get(cid);
      const title = mode === 'single'
        ? (routeTitle || (crew ? `${crew.name} · ${formatDateLabel(selectedDate)}` : null))
        : (crew ? `${crew.name} · ${formatDateLabel(selectedDate)}` : null);

      const totalDrive = ordered.reduce((s, st) => s + (st.drive_minutes_from_prev ?? 0), 0);
      const totalWork = ordered.reduce((s, st) => s + (st.estimated_duration_minutes ?? 30), 0);

      const { data: route, error: routeErr } = await supabase
        .from('routes')
        .insert({
          company_id: companyId,
          crew_id: cid,
          route_date: selectedDate,
          title,
          status: dispatch ? 'active' : 'draft',
          total_drive_minutes: totalDrive,
          total_job_minutes: totalWork,
          total_stops: ordered.length,
          weather_checked_at: weather ? new Date().toISOString() : null,
          weather_summary: weather?.summary ?? null,
          weather_flag: weather?.flag ?? false,
          optimized_at: optimized ? new Date().toISOString() : null,
          created_by: userId,
        })
        .select('id')
        .single();

      if (routeErr || !route) {
        toast.error(routeErr?.message ?? 'Failed to save route.');
        return null;
      }

      const stopInserts = ordered.map((s, i) => ({
        route_id: route.id,
        job_id: s.job_id,
        label: s.job_id ? null : s.label,
        address: s.job_id ? null : s.address,
        lat: s.job_id ? null : s.lat,
        lng: s.job_id ? null : s.lng,
        stop_order: i + 1,
        estimated_duration_minutes: s.estimated_duration_minutes,
        drive_minutes_from_prev: Math.round(s.drive_minutes_from_prev),
        drive_distance_miles: s.drive_distance_miles,
      }));

      const { error: stopsErr } = await supabase.from('route_stops').insert(stopInserts);
      if (stopsErr) {
        toast.error(stopsErr.message);
        return null;
      }

      // Reflect VROOM's order back onto the source jobs. The crew app reads
      // jobs.route_order on /today so the worker sees stops in true drive
      // order (with drive_minutes_from_previous shown between each card).
      // In multi mode we also reassign crew_id since VROOM may have moved
      // stops between trucks.
      const orderedJobs = ordered.filter((s) => !!s.job_id);
      for (let i = 0; i < orderedJobs.length; i++) {
        const s = orderedJobs[i];
        if (!s.job_id) continue;
        const update: Record<string, unknown> = {
          route_order: i + 1,
          drive_minutes_from_previous: Math.round(s.drive_minutes_from_prev ?? 0),
          drive_distance_miles_from_previous: s.drive_distance_miles ?? 0,
        };
        if (mode === 'multi') update.crew_id = cid;
        await supabase.from('jobs').update(update).eq('id', s.job_id);
      }

      createdIds.push(route.id);
      createdTitles.push(title ?? 'Route');
    }

    if (createdIds.length === 0) {
      toast.error('No stops were assigned to any crew. Run Optimize first.');
      return null;
    }

    return { ids: createdIds, titles: createdTitles };
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveRoute(false);
    setSaving(false);
    if (result) {
      toast.success(
        result.ids.length === 1
          ? 'Route saved!'
          : `${result.ids.length} routes saved.`
      );
      if (result.ids.length === 1) {
        router.push(`/dashboard/routes/${result.ids[0]}`);
      } else {
        router.push('/dashboard/routes');
      }
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    const result = await saveRoute(true);
    if (!result) { setDispatching(false); return; }

    // Notify each crew's members
    for (let i = 0; i < result.ids.length; i++) {
      const cid = selectedCrewIds.find((id) => result.titles[i].startsWith(crewById.get(id)?.name ?? '___'));
      if (!cid || !companyId) continue;
      const { data: members } = await supabase
        .from('crew_members')
        .select('profile_id')
        .eq('crew_id', cid);
      if (members?.length) {
        await supabase.from('notifications').insert(
          members.map((m: { profile_id: string }) => ({
            company_id: companyId,
            profile_id: m.profile_id,
            title: `Route dispatched: ${result.titles[i]}`,
            body: `${formatDateLabel(selectedDate)}`,
            entity_type: 'route',
            entity_id: result.ids[i],
          }))
        );
      }
    }

    setDispatching(false);
    toast.success(
      result.ids.length === 1
        ? 'Route dispatched!'
        : `${result.ids.length} routes dispatched to crews.`
    );
    if (result.ids.length === 1) {
      router.push(`/dashboard/routes/${result.ids[0]}`);
    } else {
      router.push('/dashboard/routes');
    }
  }

  // ── Derived map data ───────────────────────────────────────────────────
  const singleCrewColor = mode === 'single' && selectedCrewIds[0]
    ? (crewById.get(selectedCrewIds[0])?.color ?? 'var(--orange)')
    : 'var(--orange)';

  const mapStops: MapStop[] = stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => {
      const crew = s.assigned_crew_id ? crewById.get(s.assigned_crew_id) : null;
      return {
        id: s._key,
        lat: s.lat!,
        lng: s.lng!,
        order: s.stop_order,
        label: s.job_id
          ? ((s.job?.client as { name: string } | null)?.name ?? s.job?.title ?? 'Stop')
          : (s.label ?? 'Custom stop'),
        color: crew?.color ?? UNASSIGNED_COLOR,
        isSelected: s._key === selectedStopKey,
        groupId: s.assigned_crew_id ?? null,
      };
    });

  const mapPolylines: MapPolyline[] = mode === 'multi'
    ? Object.entries(polylinesByGroup).map(([cid, geom]) => ({
        id: cid,
        color: crewById.get(cid)?.color ?? UNASSIGNED_COLOR,
        geometry: geom,
      }))
    : (polylinesByGroup.single
        ? [{ id: 'single', color: singleCrewColor, geometry: polylinesByGroup.single }]
        : []);

  const mapLegend: MapLegendItem[] | undefined = mode === 'multi'
    ? selectedCrewIds.map((cid) => {
        const crew = crewById.get(cid);
        const count = stops.filter((s) => s.assigned_crew_id === cid).length;
        return {
          id: cid,
          label: crew?.name ?? 'Unknown',
          color: crew?.color ?? UNASSIGNED_COLOR,
          count,
        };
      })
    : undefined;

  // Stops grouped per crew for the multi-crew list view.
  const groupedStops = mode === 'multi'
    ? selectedCrewIds.map((cid) => {
        const crew = crewById.get(cid);
        if (!crew) return null;
        const crewStops = stops
          .filter((s) => s.assigned_crew_id === cid)
          .sort((a, b) => a.stop_order - b.stop_order);
        return { crew, stops: crewStops };
      }).filter((g): g is { crew: Crew; stops: StopDraft[] } => g !== null)
    : [];

  const unassignedStops = mode === 'multi'
    ? stops.filter((s) => !s.assigned_crew_id)
    : [];

  // Empty state when auto-load returns nothing
  const emptyState = (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--orange-soft)] mb-3">
        <MapPin className="h-5 w-5" style={{ color: 'var(--orange)' }} />
      </div>
      <p className="text-sm font-semibold mb-1">No jobs scheduled</p>
      <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
        No jobs found for the selected{' '}
        {selectedCrewIds.length > 1 ? 'crews' : 'crew'} on {formatDateLabel(selectedDate)}.
        Assign jobs in <span className="font-medium text-foreground">Jobs</span> or{' '}
        <span className="font-medium text-foreground">Schedule</span>, or add stops manually.
      </p>
    </div>
  );

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[420px] shrink-0 flex flex-col border-r bg-background overflow-hidden">

        {/* Top: date + crew picker + (single) title */}
        <div className="p-4 border-b space-y-3 shrink-0">
          <div>
            <Label className="text-xs mb-1 block">Date</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Crews</Label>
            <CrewMultiPicker
              crews={crews}
              selectedIds={selectedCrewIds}
              onChange={setSelectedCrewIds}
              disabled={loadingJobs || optimizingMulti}
            />
          </div>
          {mode === 'single' && (
            <div>
              <Label className="text-xs mb-1 block">Route Title</Label>
              <Input
                placeholder="e.g. Crew Alpha · Mon May 8"
                value={routeTitle}
                onChange={(e) => setRouteTitle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}
        </div>

        {/* Pick-jobs CTA — primary path. Auto-load is the secondary link. */}
        <div className="px-3 pb-2 shrink-0">
          <Button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={!companyId}
            className="w-full gap-2 h-11 font-semibold"
            style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
          >
            <ListChecks className="h-4 w-4" />
            + Choose Jobs for This Route
          </Button>
          <button
            type="button"
            onClick={() => {
              setPickerMode(false);
              setStops([]);
            }}
            disabled={!selectedDate || selectedCrewIds.length === 0}
            className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
          >
            Or auto-load all jobs scheduled for{' '}
            {selectedDate ? formatDateLabel(selectedDate) : 'the selected date'}
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0 flex-wrap">
          {mode === 'single' ? (
            <OptimizeButton
              stops={stops}
              onOptimized={handleOptimizedSingle}
              disabled={loadingJobs}
            />
          ) : (
            <Button
              size="sm"
              onClick={handleOptimizeMulti}
              disabled={loadingJobs || optimizingMulti || stops.length === 0}
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              className="gap-1.5 font-semibold"
            >
              {optimizingMulti ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Optimizing routes…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Optimize Routes
                </>
              )}
            </Button>
          )}
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
        {weatherInfo?.flag && <WeatherBanner summary={weatherInfo.summary} />}

        {/* Stops — single or grouped */}
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
              {mode === 'single' ? (
                <>
                  <StopList
                    stops={stops}
                    crewColor={singleCrewColor}
                    selectedStopId={selectedStopKey}
                    onReorder={handleReorderSingle}
                    onRemove={handleRemove}
                    onDurationChange={handleDurationChange}
                    onStopSelect={setSelectedStopKey}
                    emptyState={
                      selectedCrewIds.length > 0 && autoLoaded ? emptyState : undefined
                    }
                  />
                  {selectedCrewIds.length > 0 && (
                    <AddStopInput onAdd={handleAddStop} crewColor={singleCrewColor} />
                  )}
                </>
              ) : (
                <>
                  {!optimized && stops.length > 0 && (
                    <div className="px-3 pt-3">
                      <div
                        className="rounded-lg border-l-4 bg-[var(--orange-soft)] px-3 py-2 text-xs"
                        style={{ borderLeftColor: 'var(--orange)' }}
                      >
                        <p className="font-semibold" style={{ color: 'var(--orange-deep)' }}>
                          {stops.length} stop{stops.length === 1 ? '' : 's'} loaded across {selectedCrewIds.length} crews.
                          {unassignedStops.length > 0 && (
                            <> · {unassignedStops.length} unassigned</>
                          )}
                        </p>
                        <p className="mt-0.5 text-[var(--orange-deep)]/80">
                          Showing current assignments. Click{' '}
                          <span className="font-semibold">✨ Optimize Routes</span>{' '}
                          to redistribute.
                        </p>
                      </div>
                    </div>
                  )}
                  {stops.length === 0 && autoLoaded ? (
                    emptyState
                  ) : (
                    <GroupedStopList
                      groups={groupedStops}
                      unassignedStops={unassignedStops}
                      selectedStopId={selectedStopKey}
                      onStopSelect={setSelectedStopKey}
                      onRemove={handleRemove}
                      onDurationChange={handleDurationChange}
                      crews={crews}
                      onStopCrewChange={handleStopCrewChange}
                    />
                  )}
                </>
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
          polylines={mapPolylines}
          crewColor={singleCrewColor}
          selectedStopId={selectedStopKey}
          onStopClick={(id) =>
            setSelectedStopKey((prev) => (prev === id ? null : id))
          }
          legend={mapLegend}
        />
        {selectedCrewIds.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm pointer-events-none">
            <p className="text-sm font-medium text-foreground bg-background rounded-lg px-4 py-2.5 shadow border">
              Select one or more crews to build the route
            </p>
          </div>
        )}
      </div>

      {/* Multi-select job picker — mounted in the page so it can pull from
       *  the full schedulable job pool, not just today's auto-load set. */}
      {companyId && (
        <JobPickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          companyId={companyId}
          crews={crews}
          defaultDate={selectedDate}
          alreadyInRoute={new Set(stops.map((s) => s.job_id).filter((id): id is string => !!id))}
          onAdd={(picked) => { void handleAddJobsFromPicker(picked); }}
        />
      )}
    </div>
  );
}
