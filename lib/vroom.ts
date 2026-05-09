export interface VroomStop {
  id: number;
  location: [number, number]; // [lng, lat]
  service: number; // seconds
}

// Calls our internal proxy at /api/optimize-route, which forwards to
// OpenRouteService's optimization endpoint. The ORS API key stays
// server-side. The payload format is identical to VROOM (vehicles + jobs);
// the only ORS-specific tweak is the vehicle `profile` value.
const PROXY_URL = '/api/optimize-route';
const VROOM_PROFILE = 'driving-car';
const PROXY_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error('Optimization timed out — try again or build the route manually.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function optimizeRoute(
  stops: VroomStop[],
  startLocation: [number, number]
): Promise<number[] | null> {
  if (stops.length < 2) return stops.map((s) => s.id);

  const payload = {
    vehicles: [
      {
        id: 1,
        start: startLocation,
        end: startLocation,
        profile: VROOM_PROFILE,
      },
    ],
    jobs: stops.map((s) => ({
      id: s.id,
      location: s.location,
      service: s.service,
    })),
  };

  try {
    const res = await fetchWithTimeout(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || !json?.ok) return null;

    const jobSteps = (json.result?.routes?.[0]?.steps ?? []).filter(
      (s: { type: string }) => s.type === 'job'
    );
    return jobSteps.map((s: { id: number }) => s.id);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Multi-crew optimization
// ---------------------------------------------------------------------------

export interface CrewVehicle {
  crew_id: string;
}

export interface MultiCrewAssignment {
  crew_id: string;
  stop_ids: number[]; // ordered, matching VroomStop.id values
  duration_seconds: number; // total drive + service time per VROOM
}

export interface MultiCrewResult {
  assignments: MultiCrewAssignment[];
  unassigned: number[];
  total_duration_seconds: number;
}

export type MultiCrewOptimizationOutcome =
  | { ok: true; result: MultiCrewResult }
  | { ok: false; error: string; status?: number };

export async function optimizeMultiCrewRoute(
  stops: VroomStop[],
  crews: CrewVehicle[],
  startLocation: [number, number]
): Promise<MultiCrewOptimizationOutcome> {
  if (crews.length === 0) {
    return { ok: false, error: 'No crews selected.' };
  }
  if (stops.length === 0) {
    return {
      ok: true,
      result: { assignments: [], unassigned: [], total_duration_seconds: 0 },
    };
  }

  // Validate every stop has finite coords. ORS rejects NaN/null.
  for (const s of stops) {
    const [lng, lat] = s.location ?? [];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return {
        ok: false,
        error: `Stop ${s.id} has invalid coordinates ([${lng}, ${lat}]). All stops must be geocoded before optimizing.`,
      };
    }
  }
  const [depotLng, depotLat] = startLocation;
  if (!Number.isFinite(depotLng) || !Number.isFinite(depotLat)) {
    return {
      ok: false,
      error: `Depot location is invalid ([${depotLng}, ${depotLat}]). Add a company address in Settings or geocode the route centroid.`,
    };
  }

  // VROOM/ORS requires integer vehicle ids. We use 1..N and remember the mapping
  // back to crew_ids in the order we sent them.
  const payload = {
    vehicles: crews.map((_, i) => ({
      id: i + 1,
      start: startLocation,
      end: startLocation,
      profile: VROOM_PROFILE,
    })),
    jobs: stops.map((s) => ({
      id: s.id,
      location: s.location,
      service: s.service,
    })),
  };

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[ORS optimize] payload', JSON.parse(JSON.stringify(payload)));
  }

  try {
    const res = await fetchWithTimeout(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null) as
      | { ok?: boolean; result?: unknown; error?: string; status?: number }
      | null;

    if (!res.ok || !json?.ok) {
      const msg = json?.error ?? `Optimization HTTP ${res.status}`;
      return { ok: false, status: json?.status ?? res.status, error: msg };
    }

    const data = json.result as {
      routes?: Array<{ vehicle: number; steps: Array<{ type: string; id?: number }>; duration: number }>;
      unassigned?: Array<{ id: number }>;
    };
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[ORS optimize] response', data);
    }

    const routes = data.routes ?? [];
    const assignments: MultiCrewAssignment[] = crews.map((c) => ({
      crew_id: c.crew_id,
      stop_ids: [],
      duration_seconds: 0,
    }));

    let totalDuration = 0;
    for (const r of routes) {
      const idx = r.vehicle - 1;
      if (idx < 0 || idx >= crews.length) continue;
      assignments[idx].stop_ids = r.steps
        .filter((s) => s.type === 'job' && typeof s.id === 'number')
        .map((s) => s.id as number);
      assignments[idx].duration_seconds = r.duration;
      totalDuration += r.duration;
    }

    const unassigned = (data.unassigned ?? []).map((u) => u.id);

    return {
      ok: true,
      result: { assignments, unassigned, total_duration_seconds: totalDuration },
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? 'Unknown error calling optimization proxy.',
    };
  }
}

export function routeCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  const sum = coords.reduce(
    ([ax, ay], [x, y]) => [ax + x, ay + y] as [number, number],
    [0, 0] as [number, number]
  );
  return [sum[0] / coords.length, sum[1] / coords.length];
}
