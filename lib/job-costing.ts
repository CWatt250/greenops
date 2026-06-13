import type { JobCostEntry } from '@/types';
import { marginToneWithGray } from '@/lib/margin-colors';

export interface CrewMemberRate {
  profile_id: string;
  /** Raw crew_members.hourly_rate — null when the member has no rate set, or
   *  the profile has no crew_members row at all (passed as absent). Do NOT
   *  pre-coalesce to a default; the absence is what flags "rate not set". */
  hourly_rate: number | null;
  labor_burden_pct: number | null;
}

export interface CostBreakdown {
  labor_hours: number;
  labor_cost: number;
  materials_cost: number;
  equipment_cost: number;
  overhead_cost: number;
  total_cost: number;
}

export interface ClockInterval {
  profile_id: string;
  clocked_in_at: string;
  clocked_out_at?: string | null;
}

export interface ClockEvent {
  profile_id: string;
  event_type: 'clock_in' | 'clock_out';
  created_at: string;
}

/**
 * Pair clock_in / clock_out events per profile into intervals. Unpaired
 * clock_ins (crew still on the clock) get clocked_out_at = null.
 */
export function pairClockEvents(events: ClockEvent[]): ClockInterval[] {
  const byProfile = new Map<string, ClockEvent[]>();
  for (const e of events) {
    const list = byProfile.get(e.profile_id) ?? [];
    list.push(e);
    byProfile.set(e.profile_id, list);
  }
  const intervals: ClockInterval[] = [];
  for (const [pid, list] of byProfile.entries()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let openIn: string | null = null;
    for (const e of sorted) {
      if (e.event_type === 'clock_in') {
        openIn = e.created_at;
      } else if (e.event_type === 'clock_out' && openIn) {
        intervals.push({
          profile_id: pid,
          clocked_in_at: openIn,
          clocked_out_at: e.created_at,
        });
        openIn = null;
      }
    }
    if (openIn) {
      intervals.push({ profile_id: pid, clocked_in_at: openIn, clocked_out_at: null });
    }
  }
  return intervals;
}

const MS_PER_HOUR = 3_600_000;

export interface LaborResult {
  hours: number;
  cost: number;
  /** Profiles that logged hours on the job but have no resolvable pay rate
   *  (no crew_members rate AND no company default). Their hours are counted
   *  but excluded from `cost` — so the labor total is UNDERSTATED. Callers
   *  must treat a non-empty list as "rate not set" and refuse to show a
   *  margin rather than report a fabricated one. */
  unratedProfileIds: string[];
}

/**
 * Compute actual labor hours + cost from clock_events.
 * Pairs successive 'clock_in' / 'clock_out' events per profile.
 *
 * Rate resolution per profile (no silent fabrication):
 *   1. the member's own crew_members.hourly_rate, else
 *   2. the company default rate (opts.companyDefaultRate), else
 *   3. unrated — hours counted, cost excluded, profile flagged.
 */
export function actualLaborFromClock(
  intervals: ClockInterval[],
  rates: CrewMemberRate[],
  opts: { companyDefaultRate?: number | null } = {},
): LaborResult {
  const rateById = new Map(rates.map((r) => [r.profile_id, r] as const));
  const companyDefault = typeof opts.companyDefaultRate === 'number' && opts.companyDefaultRate > 0
    ? opts.companyDefaultRate
    : null;
  let totalHours = 0;
  let totalCost = 0;
  const unrated = new Set<string>();
  for (const iv of intervals) {
    if (!iv.clocked_in_at) continue;
    const start = new Date(iv.clocked_in_at).getTime();
    const end = iv.clocked_out_at
      ? new Date(iv.clocked_out_at).getTime()
      : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const hours = (end - start) / MS_PER_HOUR;
    totalHours += hours;

    const r = rateById.get(iv.profile_id);
    const memberRate = typeof r?.hourly_rate === 'number' && r.hourly_rate >= 0 ? r.hourly_rate : null;
    const rate = memberRate ?? companyDefault;
    if (rate === null) {
      unrated.add(iv.profile_id);
      continue;
    }
    const burden = (typeof r?.labor_burden_pct === 'number' ? r.labor_burden_pct : 0) / 100;
    totalCost += hours * rate * (1 + burden);
  }
  return {
    hours: Math.round(totalHours * 100) / 100,
    cost: Math.round(totalCost * 100) / 100,
    unratedProfileIds: [...unrated],
  };
}

/**
 * Sum cost entries by category. Empty categories return 0.
 */
export function sumCostEntries(
  entries: JobCostEntry[],
): Record<JobCostEntry['category'], number> {
  const out: Record<JobCostEntry['category'], number> = {
    material: 0,
    equipment: 0,
    other: 0,
  };
  for (const e of entries) {
    const fallback = (e.quantity ?? 0) * (e.unit_cost ?? 0);
    out[e.category] += Number(e.total_cost ?? fallback);
  }
  return out;
}

/**
 * Apply company overhead to a sub-total of labor + materials + equipment.
 * Overhead is expressed as a percentage of that sub-total.
 */
export function applyOverhead(
  laborCost: number,
  materialsCost: number,
  equipmentCost: number,
  overheadPct: number,
): { overhead: number; total: number } {
  const subtotal = laborCost + materialsCost + equipmentCost;
  const overhead = Math.round(subtotal * (overheadPct / 100) * 100) / 100;
  return { overhead, total: Math.round((subtotal + overhead) * 100) / 100 };
}

/**
 * Variance signal — green / yellow / red — comparing actual vs estimated.
 * Under-budget is always green. Over-budget by ≤10% is yellow. >10% is red.
 */
export function varianceTone(actual: number, estimated: number): 'green' | 'yellow' | 'red' {
  if (estimated <= 0) return actual === 0 ? 'green' : 'yellow';
  if (actual <= estimated) return 'green';
  const overPct = ((actual - estimated) / estimated) * 100;
  if (overPct <= 10) return 'yellow';
  return 'red';
}

/** Why a margin can't be shown as a real number. */
export type CostStatus = 'ok' | 'no_cost_data' | 'rate_not_set' | 'no_revenue';

export interface ProfitSummary {
  revenue: number;
  total_cost: number;
  profit: number;
  margin_pct: number;
  /** Display string for the margin — "—" whenever a real percentage would be
   *  misleading (no cost data, unpriced labor, or no revenue). Render THIS,
   *  never `margin_pct`, so a fabricated "100.0%" can't leak to the UI. */
  margin_label: string;
  tone: 'green' | 'yellow' | 'red' | 'gray';
  status: CostStatus;
}

/**
 * Profit + margin with honest "can't compute" states.
 *
 *   - no cost data (cost ≤ 0): a job with no tracked labor and no logged
 *     materials has UNKNOWN cost — showing 100% margin would be a fabrication.
 *   - rate not set: someone logged hours we can't price (see actualLaborFromClock)
 *     — the cost is understated, so the margin would be too high.
 *   - no revenue: margin is undefined without revenue.
 *
 * In every non-"ok" case margin_label is "—" and the tone is gray.
 */
export function profitSummary(
  revenue: number,
  totalCost: number,
  opts: { ratesComplete?: boolean; hasCostData?: boolean } = {},
): ProfitSummary {
  const ratesComplete = opts.ratesComplete ?? true;
  const hasCostData = opts.hasCostData ?? totalCost > 0;
  const profit = Math.round((revenue - totalCost) * 100) / 100;

  const base = { revenue, total_cost: totalCost, profit };

  if (!hasCostData) {
    return { ...base, margin_pct: 0, margin_label: '—', tone: 'gray', status: 'no_cost_data' };
  }
  if (!ratesComplete) {
    return { ...base, margin_pct: 0, margin_label: '—', tone: 'gray', status: 'rate_not_set' };
  }
  if (revenue <= 0) {
    return { ...base, margin_pct: 0, margin_label: '—', tone: 'gray', status: 'no_revenue' };
  }
  const margin_pct = Math.round((profit / revenue) * 1000) / 10;
  return {
    ...base,
    margin_pct,
    margin_label: `${margin_pct.toFixed(1)}%`,
    tone: marginToneWithGray(margin_pct, revenue),
    status: 'ok',
  };
}

export function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);
}

export function fmtHours(h: number): string {
  if (h <= 0) return '0h';
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}
