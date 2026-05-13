// Mapbox Directions API helper — compute drive time + distance between two
// points. Used for:
//   * "Depart HQ at HH:MM" on the Morning Brief (HQ → first stop)
//   * "X min from previous · Y mi" on each subsequent stop card
//   * Live ETA broadcast when a worker taps "Get Directions"
//
// The Mapbox token is public (NEXT_PUBLIC_MAPBOX_TOKEN), so this can be
// called from either client or server components.

import { MAPBOX_TOKEN } from './mapbox';

export interface DriveLeg {
  /** Drive time in seconds. */
  duration_seconds: number;
  /** Drive distance in meters. */
  distance_meters: number;
  /** Drive time in minutes, rounded. */
  duration_minutes: number;
  /** Drive distance in miles, rounded to one decimal. */
  distance_miles: number;
}

const M_TO_MILES = 0.000621371;

/** Compute a single driving leg between two [lng, lat] points. */
export async function getDriveLeg(
  from: [number, number],
  to: [number, number],
): Promise<DriveLeg | null> {
  if (!MAPBOX_TOKEN) return null;
  if (!from.every(Number.isFinite) || !to.every(Number.isFinite)) return null;

  try {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
      `?alternatives=false&geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json() as {
      routes?: Array<{ duration: number; distance: number }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    return {
      duration_seconds: route.duration,
      distance_meters: route.distance,
      duration_minutes: Math.max(1, Math.round(route.duration / 60)),
      distance_miles: Math.round(route.distance * M_TO_MILES * 10) / 10,
    };
  } catch {
    return null;
  }
}

/** Compute legs for an ordered chain of points. Returns one leg per gap. */
export async function getDriveChain(
  points: Array<[number, number]>,
): Promise<Array<DriveLeg | null>> {
  if (points.length < 2) return [];
  const legs = await Promise.all(
    points.slice(0, -1).map((p, i) => getDriveLeg(p, points[i + 1])),
  );
  return legs;
}
