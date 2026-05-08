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
  /** Parsed address parts from the Mapbox `context` array. */
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  context?: Array<{ id: string; text: string; short_code?: string }>;
}

function parseFeature(f: MapboxFeature): PlaceSuggestion {
  const ctx = f.context ?? [];
  // id prefixes: 'place.X' = city, 'region.X' = state, 'postcode.X' = zip
  const findByPrefix = (prefix: string) =>
    ctx.find((c) => c.id?.startsWith(prefix));
  const city = findByPrefix('place')?.text ?? null;
  const stateEntry = findByPrefix('region');
  // Prefer the two-letter region code (e.g. 'us-wa' → 'WA'); fall back to text.
  const state = stateEntry
    ? (stateEntry.short_code?.split('-').pop()?.toUpperCase() ?? stateEntry.text)
    : null;
  const zip = findByPrefix('postcode')?.text ?? null;
  return {
    id: f.id,
    placeName: f.place_name,
    shortName: f.text,
    context: ctx.map((c) => c.text).join(', '),
    lng: f.center[0],
    lat: f.center[1],
    city,
    state,
    zip,
  };
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
    const features = (data.features ?? []) as MapboxFeature[];
    return features.map(parseFeature);
  } catch {
    return [];
  }
}

/**
 * Geocode a free-form address string and return a parsed PlaceSuggestion.
 * Used when the user hits Enter / Search without picking a typeahead.
 */
export async function geocodeAddressDetailed(
  address: string
): Promise<PlaceSuggestion | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?` +
      `limit=1&proximity=${TRI_CITIES_PROXIMITY}&country=us&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    const f = (data.features ?? [])[0] as MapboxFeature | undefined;
    if (!f) return null;
    return parseFeature(f);
  } catch {
    return null;
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
