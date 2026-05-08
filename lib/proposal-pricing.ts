import type { LineItemFrequency, PropertyComplexity } from '@/types';

export const FREQUENCY_LABELS: Record<LineItemFrequency, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  seasonal: 'Seasonal',
  annual: 'Annual',
};

// Number of paid visits per year for each frequency (used for annual value).
export const FREQUENCY_VISITS_PER_YEAR: Record<LineItemFrequency, number> = {
  one_time: 1,
  weekly: 26, // mowing-season weeks
  biweekly: 13,
  monthly: 12,
  seasonal: 4,
  annual: 1,
};

// Auto-applied loyalty discount when a line is set to a recurring frequency.
export const FREQUENCY_DISCOUNT_PCT: Record<LineItemFrequency, number> = {
  one_time: 0,
  weekly: 15,
  biweekly: 10,
  monthly: 5,
  seasonal: 0,
  annual: 0,
};

export const COMPLEXITY_LABOR_MULTIPLIER: Record<PropertyComplexity, number> = {
  simple: 1,
  moderate: 1.15,
  complex: 1.30,
};

export const SLOPE_MULTIPLIER = 1.10;
export const DOGS_MULTIPLIER = 1.05;

export interface PricingFlags {
  property_complexity: PropertyComplexity;
  has_slopes: boolean;
  has_dogs: boolean;
  has_obstacles: boolean;
}

export function laborMultiplier(flags: PricingFlags): number {
  let m = COMPLEXITY_LABOR_MULTIPLIER[flags.property_complexity];
  if (flags.has_slopes) m *= SLOPE_MULTIPLIER;
  if (flags.has_dogs) m *= DOGS_MULTIPLIER;
  return m;
}

export interface LineItemDraft {
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  markup_pct: number;
  discount_pct: number;
  frequency: LineItemFrequency;
  frequency_discount_pct: number;
}

/** Per-visit total after markup, discount, and frequency discount. */
export function lineTotal(item: LineItemDraft, flags?: PricingFlags): number {
  const labor = flags ? laborMultiplier(flags) : 1;
  const base = item.quantity * item.unit_price * labor;
  const afterMarkup = base * (1 + item.markup_pct / 100);
  const afterDiscount = afterMarkup * (1 - item.discount_pct / 100);
  const afterFrequency = afterDiscount * (1 - (item.frequency_discount_pct ?? 0) / 100);
  return Math.round(afterFrequency * 100) / 100;
}

/** Annual contract value across all recurring lines. */
export function annualValue(items: LineItemDraft[], flags?: PricingFlags): number {
  let total = 0;
  for (const item of items) {
    const visits = FREQUENCY_VISITS_PER_YEAR[item.frequency] ?? 1;
    total += lineTotal(item, flags) * visits;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Rough profit margin: revenue - estimated cost / revenue.
 * Cost = labor (assumed 50% of price) + 15% overhead.
 * The threshold colours give the dispatcher a fast read on whether the
 * proposal is healthy.
 */
export function profitMargin(items: LineItemDraft[], flags?: PricingFlags): number {
  const revenue = items.reduce((s, i) => s + lineTotal(i, flags), 0);
  if (revenue === 0) return 0;
  const labor = flags ? laborMultiplier(flags) : 1;
  // Labor portion scales with the multiplier; materials assumed 15% of base.
  const cost = items.reduce((s, i) => {
    const base = i.quantity * i.unit_price;
    return s + base * 0.5 * labor + base * 0.15;
  }, 0);
  return Math.round(((revenue - cost) / revenue) * 100);
}

export function marginColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 30) return 'green';
  if (pct >= 20) return 'yellow';
  return 'red';
}
