export interface VroomStop {
  id: number;
  location: [number, number]; // [lng, lat]
  service: number; // seconds
}

const VROOM_URL = 'https://router.project-osrm.org/vroom';

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
        profile: 'driving',
      },
    ],
    jobs: stops.map((s) => ({
      id: s.id,
      location: s.location,
      service: s.service,
    })),
  };

  try {
    const res = await fetch(VROOM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`VROOM returned ${res.status}`);
    const data = await res.json();

    const jobSteps = (data.routes?.[0]?.steps ?? []).filter(
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
  // Stops VROOM couldn't fit (rare with no constraints, but possible).
  unassigned: number[];
  // Sum of vehicle durations across all crews (drive + service time).
  total_duration_seconds: number;
}

export async function optimizeMultiCrewRoute(
  stops: VroomStop[],
  crews: CrewVehicle[],
  startLocation: [number, number]
): Promise<MultiCrewResult | null> {
  if (crews.length === 0) return null;
  if (stops.length === 0) {
    return { assignments: [], unassigned: [], total_duration_seconds: 0 };
  }

  // VROOM requires integer vehicle ids. We use 1..N and remember the mapping
  // back to crew_ids in the order we sent them.
  const payload = {
    vehicles: crews.map((c, i) => ({
      id: i + 1,
      start: startLocation,
      end: startLocation,
      profile: 'driving',
    })),
    jobs: stops.map((s) => ({
      id: s.id,
      location: s.location,
      service: s.service,
    })),
  };

  try {
    const res = await fetch(VROOM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`VROOM returned ${res.status}`);
    const data = await res.json();

    type VroomStep = { type: string; id?: number };
    type VroomRoute = { vehicle: number; steps: VroomStep[]; duration: number };

    const routes = (data.routes ?? []) as VroomRoute[];
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

    const unassigned = ((data.unassigned ?? []) as Array<{ id: number }>).map(
      (u) => u.id
    );

    return {
      assignments,
      unassigned,
      total_duration_seconds: totalDuration,
    };
  } catch {
    return null;
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
