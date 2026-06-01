import * as turf from '@turf/turf';

export type ShapeKind = 'polygon' | 'line';

// Polygon subtypes (areas)
export type AreaType = 'turf' | 'hardscape' | 'bed' | 'other';
// Line subtypes (linear features)
export type LineType = 'edging' | 'fence' | 'driveway' | 'other';

export type ShapeType = AreaType | LineType;

export interface MeasuredShape {
  id: string;
  label: string;
  kind: ShapeKind;
  type: ShapeType;
  area_sqft: number; // 0 for lines
  length_ft: number; // 0 for polygons
  geometry: GeoJSON.Polygon | GeoJSON.LineString;
}

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  turf: 'Turf',
  hardscape: 'Hardscape',
  bed: 'Bed',
  other: 'Other',
};

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  edging: 'Edging',
  fence: 'Fence',
  driveway: 'Driveway',
  other: 'Other',
};

export const SHAPE_TYPE_LABELS: Record<ShapeType, string> = {
  ...AREA_TYPE_LABELS,
  ...LINE_TYPE_LABELS,
} as Record<ShapeType, string>;

export const SHAPE_TYPE_COLORS: Record<ShapeType, string> = {
  turf:      '#4F8438', // green
  hardscape: '#6B7280', // gray-500
  bed:       '#8B5C18', // brown
  edging:    '#F15A24', // TLC orange
  fence:     '#7C3AED', // violet
  driveway:  '#1F2937', // gray-900
  other:     '#3B6FB8', // blue
};

const SQ_METERS_TO_SQ_FEET = 10.7639;
const METERS_TO_FEET = 3.28084;

export function polygonAreaSqFt(geometry: GeoJSON.Polygon): number {
  try {
    const sqM = turf.area(turf.polygon(geometry.coordinates as number[][][]));
    return Math.round(sqM * SQ_METERS_TO_SQ_FEET);
  } catch {
    return 0;
  }
}

export function lineLengthFt(geometry: GeoJSON.LineString): number {
  try {
    const km = turf.length(turf.lineString(geometry.coordinates as number[][]), { units: 'kilometers' });
    return Math.round(km * 1000 * METERS_TO_FEET);
  } catch {
    return 0;
  }
}

// ── Live per-segment distance helpers ──────────────────────────────────────
// Shared by the desktop (mouse cursor) and mobile (centre crosshair) measure
// paths so live rubber-band distances and static edge labels are computed and
// formatted identically in both contexts.

export type LngLat = [number, number];

/** Great-circle length of a single segment, in feet (rounded). */
export function segmentLengthFt(a: LngLat, b: LngLat): number {
  try {
    const km = turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' });
    return Math.round(km * 1000 * METERS_TO_FEET);
  } catch {
    return 0;
  }
}

/** Map label for a distance in feet, matching the tool's existing "1,234 ft". */
export function formatFeetLabel(ft: number): string {
  return `${Math.round(ft).toLocaleString()} ft`;
}

/** Arithmetic midpoint of a segment — at property scale this is visually
 *  identical to a geodesic midpoint but exact and cheap to place a label. */
export function segmentMidpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export interface SegmentLabel {
  /** Midpoint to anchor the label marker. */
  mid: LngLat;
  /** Segment length in feet. */
  ft: number;
}

/**
 * Per-segment labels for an ordered list of points. When `closeRing` is set the
 * final point connects back to the first (used to label a polygon's closing
 * edge). Used for in-progress drawings where points are a raw array.
 */
export function segmentLabels(points: LngLat[], closeRing = false): SegmentLabel[] {
  const path = closeRing && points.length >= 3 ? [...points, points[0]] : points;
  const out: SegmentLabel[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    out.push({ mid: segmentMidpoint(path[i], path[i + 1]), ft: segmentLengthFt(path[i], path[i + 1]) });
  }
  return out;
}

/**
 * Per-edge labels for a completed shape's geometry. Polygon rings stored by the
 * tool are already closed (first === last), so every consecutive pair — including
 * the closing edge — is labelled. Lines label each segment between vertices.
 */
export function shapeSegmentLabels(geometry: GeoJSON.Polygon | GeoJSON.LineString): SegmentLabel[] {
  const points = geometry.type === 'Polygon'
    ? (geometry.coordinates[0] as LngLat[])
    : (geometry.coordinates as LngLat[]);
  return segmentLabels(points, false);
}

export interface AreaTotals {
  turf: number;
  hardscape: number;
  bed: number;
  other: number;
  total: number;
  lineLength: number; // total length across all line shapes (ft)
}

export function totalsByType(shapes: MeasuredShape[]): AreaTotals {
  const out: AreaTotals = {
    turf: 0, hardscape: 0, bed: 0, other: 0, total: 0, lineLength: 0,
  };
  for (const s of shapes) {
    if (s.kind === 'line') {
      out.lineLength += s.length_ft;
      continue;
    }
    // polygon: sum into the right bucket. line subtypes shouldn't appear
    // on polygons but fall back to 'other' if they do.
    const t: AreaType =
      (s.type === 'turf' || s.type === 'hardscape' || s.type === 'bed' || s.type === 'other')
        ? (s.type as AreaType)
        : 'other';
    out[t] += s.area_sqft;
    out.total += s.area_sqft;
  }
  return out;
}

// TLC pricing defaults (configurable via services.per_sqft_rate)
export const DEFAULT_MOWING_RATE_PER_SQFT = 0.008;
// 26 weekly visits in the mowing season (April–October).
export const MOWING_SEASON_VISITS = 26;

export function estimatedMowingPerVisit(turfSqft: number, rate = DEFAULT_MOWING_RATE_PER_SQFT): number {
  return Math.round(turfSqft * rate * 100) / 100;
}

export function estimatedAnnualMowing(turfSqft: number, rate = DEFAULT_MOWING_RATE_PER_SQFT): number {
  return Math.round(estimatedMowingPerVisit(turfSqft, rate) * MOWING_SEASON_VISITS * 100) / 100;
}

/**
 * Smart label suggestion for a polygon: looks at its centroid relative to a
 * property pin and suggests Front Lawn / Back Lawn / Side Yard for turf.
 * Returns null when nothing useful can be inferred.
 */
export function suggestLabel(
  geometry: GeoJSON.Polygon | GeoJSON.LineString,
  type: ShapeType,
  pin: { lng: number; lat: number } | null
): string | null {
  if (type === 'driveway') return 'Driveway';
  if (type === 'fence') return 'Fence Line';
  if (type === 'edging') return 'Edging';
  if (type === 'bed') return 'Mulch Bed';
  if (type === 'hardscape') return 'Hardscape';
  if (type !== 'turf') return null;
  if (!pin) return 'Lawn';

  try {
    // Centroid of the shape
    const feature: GeoJSON.Feature = geometry.type === 'Polygon'
      ? turf.polygon(geometry.coordinates as number[][][])
      : turf.lineString(geometry.coordinates as number[][]);
    const c = turf.centroid(feature).geometry.coordinates as [number, number];
    const dx = c[0] - pin.lng; // east is positive
    const dy = c[1] - pin.lat; // north is positive

    // Determine front vs back relative to the pin: properties usually face
    // a street, but without orientation data the best we can do is heuristic
    // based on which side of the pin the shape sits. North = back, South = front
    // is a common mid-latitude default for the US Pacific Northwest.
    if (Math.abs(dy) > Math.abs(dx)) {
      return dy > 0 ? 'Back Lawn' : 'Front Lawn';
    }
    return dx > 0 ? 'East Side Yard' : 'West Side Yard';
  } catch {
    return 'Lawn';
  }
}

export function isAreaType(t: ShapeType): t is AreaType {
  return t === 'turf' || t === 'hardscape' || t === 'bed' || t === 'other';
}

export function isLineType(t: ShapeType): t is LineType {
  return t === 'edging' || t === 'fence' || t === 'driveway' || t === 'other';
}
