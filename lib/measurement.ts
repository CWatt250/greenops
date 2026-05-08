import * as turf from '@turf/turf';

export type ShapeType = 'turf' | 'hardscape' | 'bed' | 'other';

export interface MeasuredShape {
  id: string; // matches Mapbox Draw feature id
  label: string;
  type: ShapeType;
  area_sqft: number;
  geometry: GeoJSON.Polygon;
}

export const SHAPE_TYPE_LABELS: Record<ShapeType, string> = {
  turf: 'Turf',
  hardscape: 'Hardscape',
  bed: 'Bed',
  other: 'Other',
};

export const SHAPE_TYPE_COLORS: Record<ShapeType, string> = {
  turf: '#4F8438', // green
  hardscape: '#6B7280', // gray-500
  bed: '#8B5C18', // brown
  other: '#3B6FB8', // blue
};

const SQ_METERS_TO_SQ_FEET = 10.7639;

export function polygonAreaSqFt(geometry: GeoJSON.Polygon): number {
  try {
    const sqM = turf.area(turf.polygon(geometry.coordinates as number[][][]));
    return Math.round(sqM * SQ_METERS_TO_SQ_FEET);
  } catch {
    return 0;
  }
}

export interface AreaTotals {
  turf: number;
  hardscape: number;
  bed: number;
  other: number;
  total: number;
}

export function totalsByType(shapes: MeasuredShape[]): AreaTotals {
  const out: AreaTotals = { turf: 0, hardscape: 0, bed: 0, other: 0, total: 0 };
  for (const s of shapes) {
    out[s.type] += s.area_sqft;
    out.total += s.area_sqft;
  }
  return out;
}

// TLC pricing defaults (per spec). Configurable later via services.per_sqft_rate.
export const DEFAULT_MOWING_RATE_PER_SQFT = 0.008;
// 26 weekly visits in the mowing season (April–October).
export const MOWING_SEASON_VISITS = 26;

export function estimatedMowingPerVisit(turfSqft: number, rate = DEFAULT_MOWING_RATE_PER_SQFT): number {
  return Math.round(turfSqft * rate * 100) / 100;
}

export function estimatedAnnualMowing(turfSqft: number, rate = DEFAULT_MOWING_RATE_PER_SQFT): number {
  return Math.round(estimatedMowingPerVisit(turfSqft, rate) * MOWING_SEASON_VISITS * 100) / 100;
}
