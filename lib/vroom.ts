export interface VroomStop {
  id: number;
  location: [number, number]; // [lng, lat]
  service: number; // seconds
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
    const res = await fetch('https://router.project-osrm.org/vroom', {
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

export function routeCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  const sum = coords.reduce(
    ([ax, ay], [x, y]) => [ax + x, ay + y] as [number, number],
    [0, 0] as [number, number]
  );
  return [sum[0] / coords.length, sum[1] / coords.length];
}
