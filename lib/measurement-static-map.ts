import { MAPBOX_TOKEN } from '@/lib/mapbox';
import { SHAPE_TYPE_COLORS, type MeasuredShape } from '@/lib/measurement';

const STATIC_API_LIMIT = 8000; // Mapbox static-images URL limit, ~8KB.

/**
 * Build a Mapbox Static Images URL with all shapes overlaid as a GeoJSON
 * FeatureCollection. Returns null when the resulting URL exceeds the API
 * length limit (very complex measurements) — caller should fall back to a
 * non-map PDF.
 */
export function staticMapUrlForShapes(
  shapes: MeasuredShape[],
  center: { lng: number; lat: number } | null,
  size: { width: number; height: number } = { width: 640, height: 360 }
): string | null {
  if (!MAPBOX_TOKEN) return null;
  if (shapes.length === 0 && !center) return null;

  // Build a FeatureCollection with paint properties Mapbox understands.
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: shapes.map((s) => ({
      type: 'Feature',
      properties: {
        stroke: SHAPE_TYPE_COLORS[s.type],
        'stroke-width': s.kind === 'line' ? 4 : 2.5,
        'stroke-opacity': 1,
        fill: SHAPE_TYPE_COLORS[s.type],
        'fill-opacity': s.kind === 'line' ? 0 : 0.3,
      },
      geometry: s.geometry,
    })),
  };

  // Determine center: provided pin > centroid of shapes > Tri-Cities default.
  let lng = center?.lng ?? -119.1734;
  let lat = center?.lat ?? 46.2087;
  if (!center && shapes.length > 0) {
    const c = avgCoordinate(shapes);
    if (c) [lng, lat] = c;
  }

  const encoded = encodeURIComponent(JSON.stringify(fc));
  const overlay = shapes.length > 0 ? `geojson(${encoded})/` : '';
  // 'auto' fits the overlay automatically. Falls back to lng/lat/zoom if
  // there's no overlay to fit.
  const positioning = shapes.length > 0 ? 'auto' : `${lng},${lat},19`;

  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlay}${positioning}/${size.width}x${size.height}@2x` +
    `?access_token=${MAPBOX_TOKEN}`;

  if (url.length > STATIC_API_LIMIT) return null;
  return url;
}

function avgCoordinate(shapes: MeasuredShape[]): [number, number] | null {
  let totalLng = 0, totalLat = 0, n = 0;
  for (const s of shapes) {
    const coords = s.geometry.type === 'Polygon'
      ? (s.geometry.coordinates[0] as [number, number][])
      : (s.geometry.coordinates as [number, number][]);
    for (const [lng, lat] of coords) {
      totalLng += lng;
      totalLat += lat;
      n += 1;
    }
  }
  if (n === 0) return null;
  return [totalLng / n, totalLat / n];
}
