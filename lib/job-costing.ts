import type { JobCostEntry } from '@/types';

export interface CrewMemberRate {
  profile_id: string;
  hourly_rate: number;
  labor_burden_pct: number;
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

/**
 * Compute actual labor hours + cost from clock_events.
 * Pairs successive 'clock_in' / 'clock_out' events per profile.
 */
export function actualLaborFromClock(
  intervals: ClockInterval[],
  rates: CrewMemberRate[],
): { hours: number; cost: number } {
  const rateById = new Map(rates.map((r) => [r.profile_id, r] as const));
  let totalHours = 0;
  let totalCost = 0;
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
    const rate = r?.hourly_rate ?? 25;
    const burden = (r?.labor_burden_pct ?? 25) / 100;
    totalCost += hours * rate * (1 + burden);
  }
  return {
    hours: Math.round(totalHours * 100) / 100,
    cost: Math.round(totalCost * 100) / 100,
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

export interface ProfitSummary {
  revenue: number;
  total_cost: number;
  profit: number;
  margin_pct: number;
  tone: 'green' | 'yellow' | 'red' | 'gray';
}

export function profitSummary(revenue: number, totalCost: number): ProfitSummary {
  const profit = Math.round((revenue - totalCost) * 100) / 100;
  const margin_pct = revenue > 0
    ? Math.round((profit / revenue) * 1000) / 10
    : 0;
  let tone: ProfitSummary['tone'] = 'gray';
  if (revenue > 0) {
    if (margin_pct >= 30) tone = 'green';
    else if (margin_pct >= 15) tone = 'yellow';
    else tone = 'red';
  }
  return { revenue, total_cost: totalCost, profit, margin_pct, tone };
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
