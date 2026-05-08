export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// Tri-Cities, WA — proximity bias for geocoding queries
const TRI_CITIES_PROXIMITY = '-119.1734,46.2087';

export async function geocodeAddress(
  address: string
): Promise<[number, number] | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&proximity=${TRI_CITIES_PROXIMITY}&country=us&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    if (data.features?.length > 0) {
      return data.features[0].center as [number, number]; // [lng, lat]
    }
  } catch {}
  return null;
}

export interface PlaceSuggestion {
  id: string;
  placeName: string;
  shortName: string;
  context: string;
  lng: number;
  lat: number;
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 3) return [];
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?` +
      `limit=5&proximity=${TRI_CITIES_PROXIMITY}&country=us&types=address,poi&autocomplete=true&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    const features = (data.features ?? []) as Array<{
      id: string;
      place_name: string;
      text: string;
      center: [number, number];
      context?: Array<{ text: string }>;
    }>;
    return features.map((f) => ({
      id: f.id,
      placeName: f.place_name,
      shortName: f.text,
      context: (f.context ?? []).map((c) => c.text).join(', '),
      lng: f.center[0],
      lat: f.center[1],
    }));
  } catch {
    return [];
  }
}

export async function getRoutePolyline(
  stops: { lat: number; lng: number }[]
): Promise<GeoJSON.LineString | null> {
  if (!MAPBOX_TOKEN || stops.length < 2) return null;
  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    if (data.routes?.[0]?.geometry) return data.routes[0].geometry as GeoJSON.LineString;
  } catch {}
  return null;
}

export async function getDriveMatrix(
  stops: { lat: number; lng: number }[]
): Promise<number[][] | null> {
  if (!MAPBOX_TOKEN || stops.length < 2) return null;
  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    if (data.durations) return data.durations as number[][];
  } catch {}
  return null;
}

export async function getRouteLegs(
  stops: { lat: number; lng: number }[]
): Promise<{ duration_seconds: number; distance_meters: number }[] | null> {
  if (!MAPBOX_TOKEN || stops.length < 2) return null;
  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    if (data.routes?.[0]?.legs) {
      return data.routes[0].legs.map((leg: { duration: number; distance: number }) => ({
        duration_seconds: leg.duration,
        distance_meters: leg.distance,
      }));
    }
  } catch {}
  return null;
}
