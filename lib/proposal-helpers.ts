import type { LineItemFrequency } from '@/types';

export interface MeasurementForSuggestions {
  total_turf_sqft: number;
  total_hardscape_sqft: number;
  total_bed_sqft: number;
  total_other_sqft: number;
  /** Total of all line shapes (edging / fence / driveway). */
  total_line_ft?: number;
}

export interface ServiceSuggestion {
  /** Service category to match against the catalog. */
  category: 'mowing' | 'edging' | 'fertilization' | 'aeration' | 'cleanup' | 'tree' | 'sprinkler' | 'snow' | 'holiday' | 'other';
  frequency: LineItemFrequency;
  /** Default rate per square foot when the catalog service has none. */
  defaultRatePerSqft?: number;
  /** Default rate per linear foot for line measurements. */
  defaultRatePerLinearFt?: number;
  /** Description for the line item. */
  label: string;
  /** Pre-computed quantity (sq ft or lin ft) — caller still uses unit. */
  defaultQuantity?: number;
}

// TLC pricing defaults — overridable per service in the catalog.
export const PRICING = {
  mowingPerSqft: 0.008,
  fertilizationPerSqft: 0.02,
  edgingPerLinearFt: 0.50,
};

/**
 * Given a measurement, suggest a starter set of services for the proposal.
 * The proposal wizard uses this to pre-populate Step 2 line items when
 * launched from the measurement tool.
 */
export function suggestServicesFromMeasurement(
  measurement: MeasurementForSuggestions
): ServiceSuggestion[] {
  const turf = measurement.total_turf_sqft ?? 0;
  const hardscape = measurement.total_hardscape_sqft ?? 0;
  const bed = measurement.total_bed_sqft ?? 0;
  const lineFt = measurement.total_line_ft ?? 0;
  const out: ServiceSuggestion[] = [];

  if (turf > 0) {
    out.push({
      category: 'mowing',
      frequency: 'weekly',
      defaultRatePerSqft: PRICING.mowingPerSqft,
      label: 'Weekly Mowing',
      defaultQuantity: turf,
    });
    if (turf > 8000) {
      out.push({
        category: 'edging',
        frequency: 'weekly',
        defaultRatePerLinearFt: PRICING.edgingPerLinearFt,
        label: 'Edging',
        defaultQuantity: lineFt > 0 ? lineFt : Math.round(Math.sqrt(turf) * 4),
      });
    }
    out.push({
      category: 'fertilization',
      frequency: 'seasonal',
      defaultRatePerSqft: PRICING.fertilizationPerSqft,
      label: 'Fertilization',
      defaultQuantity: turf,
    });
  }

  if (hardscape > 0) {
    out.push({
      category: 'cleanup',
      frequency: 'monthly',
      label: 'Hardscape Maintenance',
      defaultQuantity: 1,
    });
  }

  if (bed > 0) {
    out.push({
      category: 'cleanup',
      frequency: 'seasonal',
      label: 'Mulch Beds Service',
      defaultQuantity: 1,
    });
  }

  if (turf > 15000) {
    out.push({
      category: 'aeration',
      frequency: 'annual',
      label: 'Aeration',
      defaultQuantity: 1,
    });
  }

  return out;
}

/**
 * Headline label for the lot-size bucket — used in UI hints
 * ("Suggesting Mid-Size Mowing Package…").
 */
export function lotSizeLabel(turfSqft: number): string {
  if (turfSqft <= 0) return 'No turf measured';
  if (turfSqft < 5000) return 'Standard Mowing Package';
  if (turfSqft < 15000) return 'Mid-Size Mowing Package + Edging';
  return 'Commercial / Large Property Bundle';
}
