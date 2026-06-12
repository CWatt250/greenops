import { localDateStr } from '@/lib/dates';

export interface VroomStop {
  id: number;
  location: [number, number]; // [lng, lat]
  service: number; // seconds
  /** Optional per-job hard time window (migration 041). Both bounds are
   *  epoch seconds. When set, the solver is forced to schedule the stop
   *  within this window; when omitted, the vehicle's workday window
   *  governs. */
  time_window?: [number, number];
  /** VROOM skills required to serve this stop (migration 045) — the stable
   *  `services.skill_id` of each RESTRICTED service on the job. A vehicle can
   *  only take the stop if its skill set is a superset of these. Empty/omitted
   *  = no certification required (any crew can take it). */
  skills?: number[];
}

/** Convert a "HH:MM" or "HH:MM:SS" time-of-day on the given local route date
 *  into epoch seconds. Returns null on invalid input so callers can skip
 *  emitting a window for malformed data instead of breaking the whole
 *  optimization payload. */
export function timeOfDayToEpochSeconds(
  routeDate: string,
  timeOfDay: string | null | undefined,
): number | null {
  if (!timeOfDay) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeOfDay);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] ?? '0');
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const ms = new Date(`${routeDate}T${hh}:${mm}:${ss}`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

// ---------------------------------------------------------------------------
// Duration resolution
// ---------------------------------------------------------------------------
// VROOM treats every job's `service` window as authoritative — if every stop
// is 30 minutes the solver balances by count, not time. This resolver mirrors
// the priority order documented in the audit:
//   1. jobs.estimated_duration_minutes (explicit override on the job row)
//   2. scheduled_end − scheduled_start (when both `time`s are set)
//   3. sum of job_services durations × quantity (the services spine)
//   4. sum of legacy line-item services' estimated_duration_minutes
//   5. category default for the dominant service
//   6. 30-minute fallback (and warn so we can spot un-tagged jobs)

const CATEGORY_DEFAULTS: Record<string, number> = {
  mowing: 45,
  edging: 30,
  cleanup: 180,
  fertilization: 30,
  aeration: 60,
  overseeding: 45,
  mulch: 120,
  tree: 90,
  sprinkler: 60,
  snow: 45,
  holiday: 120,
};

export const DURATION_FALLBACK_MINUTES = 30;

export interface DurationSource {
  estimated_duration_minutes?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  /** The services spine (migration 043). Preferred source: each row carries an
   *  explicit per-unit duration that VROOM multiplies by quantity. */
  job_services?: Array<{
    duration_minutes?: number | null;
    quantity?: number | null;
    service?: {
      estimated_duration_minutes?: number | null;
      category?: string | null;
    } | null;
  }> | null;
  /** Legacy fallback for jobs created before the services spine existed. */
  line_items?: Array<{
    service?: {
      estimated_duration_minutes?: number | null;
      category?: string | null;
    } | null;
  }> | null;
}

function parseTimeOfDayMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  // Postgres `time` round-trips as "HH:MM:SS" or "HH:MM" — accept both.
  const match = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function resolveJobDurationMinutes(
  job: DurationSource,
  opts: { jobId?: string | number; jobTitle?: string } = {},
): number {
  // 1. Explicit override on the job row.
  const explicit = job.estimated_duration_minutes;
  if (typeof explicit === 'number' && explicit > 0) return explicit;

  // 2. Time-of-day window.
  const start = parseTimeOfDayMinutes(job.scheduled_start);
  const end = parseTimeOfDayMinutes(job.scheduled_end);
  if (start !== null && end !== null && end > start) return end - start;

  // 3. Sum of job_services durations × quantity (the services spine).
  const jobServices = job.job_services ?? [];
  let svcSum = 0;
  for (const js of jobServices) {
    const d = js.duration_minutes ?? js.service?.estimated_duration_minutes;
    const qty = typeof js.quantity === 'number' && js.quantity > 0 ? js.quantity : 1;
    if (typeof d === 'number' && d > 0) svcSum += d * qty;
  }
  if (svcSum > 0) return svcSum;

  // 4. Legacy fallback — sum of line-item service durations.
  const items = job.line_items ?? [];
  let sum = 0;
  for (const li of items) {
    const d = li.service?.estimated_duration_minutes;
    if (typeof d === 'number' && d > 0) sum += d;
  }
  if (sum > 0) return sum;

  // 5. Dominant category default — check the spine first, then legacy items.
  const firstCategory =
    jobServices.find((js) => js.service?.category)?.service?.category
    ?? items.find((li) => li.service?.category)?.service?.category;
  if (firstCategory && firstCategory in CATEGORY_DEFAULTS) {
    return CATEGORY_DEFAULTS[firstCategory];
  }

  // 5. Fallback — warn so we can find jobs missing duration data.
  // eslint-disable-next-line no-console
  console.warn(
    `[vroom] duration fallback (${DURATION_FALLBACK_MINUTES}m) for job`,
    opts.jobId ?? opts.jobTitle ?? '(unknown)',
    '— no override, no time window, no priced services with duration.',
  );
  return DURATION_FALLBACK_MINUTES;
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
  startLocation: [number, number],
  /** Skills the single crew is certified for (migration 045). A restricted
   *  stop whose required skills aren't a subset of this lands in `unassigned`
   *  rather than being forced onto an uncertified crew. */
  vehicleSkills?: number[],
): Promise<number[] | null> {
  if (stops.length < 2) return stops.map((s) => s.id);

  const vehicle: Record<string, unknown> = {
    id: 1,
    start: startLocation,
    end: startLocation,
    profile: VROOM_PROFILE,
  };
  if (vehicleSkills && vehicleSkills.length > 0) vehicle.skills = vehicleSkills;

  const payload = {
    vehicles: [vehicle],
    jobs: stops.map((s) => {
      const j: Record<string, unknown> = {
        id: s.id,
        location: s.location,
        service: s.service,
      };
      if (s.time_window) j.time_windows = [s.time_window];
      if (s.skills && s.skills.length > 0) j.skills = s.skills;
      return j;
    }),
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
// Skills (migration 045)
// ---------------------------------------------------------------------------

/** The distinct VROOM skill_ids a job requires: the `services.skill_id` of each
 *  of its RESTRICTED services. Unrestricted services contribute nothing, so a
 *  job with only unrestricted (or no) services stays doable by any crew. */
export function requiredSkillsFromJobServices(
  jobServices:
    | Array<{ service?: { skill_id?: number | null; restricted?: boolean | null } | null } | null>
    | null
    | undefined,
): number[] {
  const set = new Set<number>();
  for (const js of jobServices ?? []) {
    const svc = js?.service;
    if (svc?.restricted && typeof svc.skill_id === 'number') set.add(svc.skill_id);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Multi-crew optimization
// ---------------------------------------------------------------------------

export interface CrewVehicle {
  crew_id: string;
  /** VROOM skills this crew holds (migration 045) — the `services.skill_id` of
   *  each restricted service the crew is certified for via crew_skills. A crew
   *  with no skills can only take stops that require none. */
  skills?: number[];
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

export interface MultiCrewOptions {
  /** Route date as YYYY-MM-DD. Drives the per-vehicle workday window
   *  (08:00–17:00 local) so VROOM can't pile every stop onto one truck. */
  routeDate?: string;
  /** Workday start hour (24h, default 8). */
  dayStartHour?: number;
  /** Workday end hour (24h, default 17). */
  dayEndHour?: number;
}

function dayWindowEpochSeconds(
  routeDate: string | undefined,
  startHour: number,
  endHour: number,
): [number, number] {
  // Build an ISO timestamp at the requested local hour. We intentionally
  // construct with no timezone so the user's local zone applies — VROOM
  // doesn't care about the absolute calendar, only the relative window
  // length. Using local epoch values keeps log-debugging human-readable.
  const date = routeDate ?? localDateStr();
  const startMs = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00`).getTime();
  const endMs = new Date(`${date}T${String(endHour).padStart(2, '0')}:00:00`).getTime();
  return [Math.floor(startMs / 1000), Math.floor(endMs / 1000)];
}

export async function optimizeMultiCrewRoute(
  stops: VroomStop[],
  crews: CrewVehicle[],
  startLocation: [number, number],
  options: MultiCrewOptions = {},
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

  // Single-crew path: skip balancing. With one vehicle there's nothing to
  // distribute, and tight capacity caps just risk leaving stops unassigned.
  if (crews.length === 1) {
    return runOrs(
      crews,
      buildPayload(stops, crews, startLocation, undefined, undefined, options),
    );
  }

  // Multi-crew: cap each vehicle's job count to share the workload roughly
  // evenly, force a workday time window so the solver can't fit everything
  // into one truck's tour, and explicitly tell VROOM not to minimize the
  // vehicle count (its default behavior — which is exactly what was
  // dumping every stop onto Crew 1 before).
  const stopsPerCrew = Math.ceil(stops.length / crews.length) + 1;
  const timeWindow = dayWindowEpochSeconds(
    options.routeDate,
    options.dayStartHour ?? 8,
    options.dayEndHour ?? 17,
  );

  let outcome = await runOrs(
    crews,
    buildPayload(stops, crews, startLocation, stopsPerCrew, timeWindow, options),
  );

  // If anything is unassigned, retry once with a looser capacity cap. This
  // covers the case where two stops are geographically far apart and one
  // bucket fills up before the other can absorb a shared boundary stop.
  if (
    outcome.ok
    && outcome.result.unassigned.length > 0
    && stopsPerCrew < stops.length
  ) {
    const looserCap = Math.min(stops.length, stopsPerCrew + 2);
    const retry = await runOrs(
      crews,
      buildPayload(stops, crews, startLocation, looserCap, timeWindow, options),
    );
    if (retry.ok && retry.result.unassigned.length < outcome.result.unassigned.length) {
      outcome = retry;
    }
  }

  return outcome;
}

function buildPayload(
  stops: VroomStop[],
  crews: CrewVehicle[],
  startLocation: [number, number],
  capacity: number | undefined,
  timeWindow: [number, number] | undefined,
  options: MultiCrewOptions,
) {
  void options; // reserved for future flags
  return {
    vehicles: crews.map((c, i) => {
      const v: Record<string, unknown> = {
        id: i + 1,
        start: startLocation,
        end: startLocation,
        profile: VROOM_PROFILE,
      };
      if (typeof capacity === 'number') v.capacity = [capacity];
      if (timeWindow) v.time_window = timeWindow;
      // Skills the crew is certified for (migration 045). Only emit when
      // non-empty — a vehicle with no skills field is treated by VROOM as an
      // empty skill set, so it can still serve any stop that requires none.
      if (c.skills && c.skills.length > 0) v.skills = c.skills;
      return v;
    }),
    jobs: stops.map((s) => {
      const j: Record<string, unknown> = {
        id: s.id,
        location: s.location,
        service: s.service,
      };
      if (typeof capacity === 'number') j.delivery = [1];
      // ORS/VROOM expects an *array* of allowable windows (typically one).
      // We always emit a single window when the dispatcher set one on the
      // job; omitting the field falls back to the vehicle's workday.
      if (s.time_window) j.time_windows = [s.time_window];
      // Required skills (migration 045): only crews whose skill set is a
      // superset can be assigned this stop. Omit when none are required.
      if (s.skills && s.skills.length > 0) j.skills = s.skills;
      return j;
    }),
    options: {
      // Keep geometry off — we draw polylines via Mapbox separately, and
      // including ORS geometry inflates the response payload.
      g: false,
      // Explicit: do NOT collapse work onto one truck.
      minimize_vehicles: false,
    },
  };
}

async function runOrs(
  crews: CrewVehicle[],
  payload: ReturnType<typeof buildPayload>,
): Promise<MultiCrewOptimizationOutcome> {

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
