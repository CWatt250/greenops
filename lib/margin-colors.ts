/**
 * Single source of truth for margin color thresholds across the app.
 *
 * Three places used to disagree (proposal chip yellow ≥ 20, profitability
 * page yellow ≥ 15, job-costing yellow ≥ 15) — same job could appear yellow
 * on one page and red on another. Everything routes through here now.
 *
 * Convention: pass margin as a percentage (e.g. 30 means 30%, not 0.30).
 */

export const MARGIN_THRESHOLDS = {
  /** ≥ this → green ("healthy"). */
  green: 30,
  /** ≥ this → yellow ("watch"). Below this is red. */
  yellow: 15,
} as const;

export type MarginTone = 'green' | 'yellow' | 'red' | 'gray';

/** Strict tone — used when callers always have a non-negative revenue. */
export function marginTone(marginPct: number): 'green' | 'yellow' | 'red' {
  if (marginPct >= MARGIN_THRESHOLDS.green) return 'green';
  if (marginPct >= MARGIN_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/** Tone with a "no data" gray fallback. Used by profitability rankings
 *  where revenue can be zero / null. */
export function marginToneWithGray(marginPct: number, revenue: number): MarginTone {
  if (revenue <= 0) return 'gray';
  return marginTone(marginPct);
}
