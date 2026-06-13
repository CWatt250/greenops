import { describe, expect, it } from 'vitest';
import {
  actualLaborFromClock,
  applyOverhead,
  pairClockEvents,
  profitSummary,
  sumCostEntries,
  varianceTone,
  type ClockEvent,
  type CrewMemberRate,
} from './job-costing';
import type { JobCostEntry } from '@/types';

// Two crew, one job. A = 2h, B = 1h, both same day.
const T = '2026-06-12T08:00:00.000Z';
function at(hoursFromT: number): string {
  return new Date(new Date(T).getTime() + hoursFromT * 3_600_000).toISOString();
}

describe('pairClockEvents', () => {
  it('pairs in/out per profile and sums multiple intervals', () => {
    const events: ClockEvent[] = [
      { profile_id: 'A', event_type: 'clock_in', created_at: at(0) },
      { profile_id: 'A', event_type: 'clock_out', created_at: at(2) },
      { profile_id: 'B', event_type: 'clock_in', created_at: at(0) },
      { profile_id: 'B', event_type: 'clock_out', created_at: at(1) },
    ];
    const intervals = pairClockEvents(events);
    expect(intervals).toHaveLength(2);
    expect(intervals.find((i) => i.profile_id === 'A')?.clocked_out_at).toBe(at(2));
  });

  it('leaves an unpaired clock_in open (clocked_out_at null)', () => {
    const intervals = pairClockEvents([
      { profile_id: 'A', event_type: 'clock_in', created_at: at(0) },
    ]);
    expect(intervals[0].clocked_out_at).toBeNull();
  });
});

describe('actualLaborFromClock', () => {
  const intervals = [
    { profile_id: 'A', clocked_in_at: at(0), clocked_out_at: at(2) }, // 2h
    { profile_id: 'B', clocked_in_at: at(0), clocked_out_at: at(1) }, // 1h
  ];

  it('sums all crew on a job: hours × rate × (1 + burden)', () => {
    const rates: CrewMemberRate[] = [
      { profile_id: 'A', hourly_rate: 40, labor_burden_pct: 50 }, // 2 × 40 × 1.5 = 120
      { profile_id: 'B', hourly_rate: 30, labor_burden_pct: 0 },  // 1 × 30 × 1.0 = 30
    ];
    const r = actualLaborFromClock(intervals, rates);
    expect(r.hours).toBe(3);
    expect(r.cost).toBe(150);
    expect(r.unratedProfileIds).toEqual([]);
  });

  it('no clock events → zero labor, no error, no unrated', () => {
    const r = actualLaborFromClock([], []);
    expect(r).toEqual({ hours: 0, cost: 0, unratedProfileIds: [] });
  });

  it('flags an unrated profile (no crew_members row) — counts hours, excludes cost', () => {
    const rates: CrewMemberRate[] = [
      { profile_id: 'A', hourly_rate: 40, labor_burden_pct: 50 }, // 120
      // B has no rate row at all
    ];
    const r = actualLaborFromClock(intervals, rates);
    expect(r.hours).toBe(3);          // B's hour still counted
    expect(r.cost).toBe(120);         // but NOT priced — understated, not fabricated
    expect(r.unratedProfileIds).toEqual(['B']);
  });

  it('flags a profile whose rate is explicitly null', () => {
    const rates: CrewMemberRate[] = [
      { profile_id: 'A', hourly_rate: null, labor_burden_pct: 25 },
      { profile_id: 'B', hourly_rate: 30, labor_burden_pct: 0 },
    ];
    const r = actualLaborFromClock(intervals, rates);
    expect(r.unratedProfileIds).toEqual(['A']);
    expect(r.cost).toBe(30); // only B priced
  });

  it('falls back to the company default rate before flagging', () => {
    const rates: CrewMemberRate[] = [
      { profile_id: 'A', hourly_rate: null, labor_burden_pct: 0 },
    ];
    const r = actualLaborFromClock(
      [{ profile_id: 'A', clocked_in_at: at(0), clocked_out_at: at(2) }],
      rates,
      { companyDefaultRate: 20 },
    );
    expect(r.cost).toBe(40); // 2h × 20, burden 0
    expect(r.unratedProfileIds).toEqual([]);
  });

  it('never fabricates the old hard-coded $25 for an unrated profile', () => {
    const r = actualLaborFromClock(
      [{ profile_id: 'X', clocked_in_at: at(0), clocked_out_at: at(4) }],
      [],
    );
    expect(r.cost).toBe(0);
    expect(r.unratedProfileIds).toEqual(['X']);
  });
});

describe('applyOverhead', () => {
  it('applies overhead to labor + materials + equipment', () => {
    const { overhead, total } = applyOverhead(120, 60, 0, 15);
    expect(overhead).toBe(27);   // 180 × 0.15
    expect(total).toBe(207);
  });
});

describe('sumCostEntries', () => {
  it('buckets by category', () => {
    const entries = [
      { category: 'material', quantity: 2, unit_cost: 30, total_cost: 60 },
      { category: 'equipment', quantity: 1, unit_cost: 15, total_cost: 15 },
    ] as JobCostEntry[];
    const sums = sumCostEntries(entries);
    expect(sums.material).toBe(60);
    expect(sums.equipment).toBe(15);
    expect(sums.other).toBe(0);
  });
});

describe('profitSummary — honest margin states', () => {
  it('computes a normal margin: (revenue - cost)/revenue', () => {
    const p = profitSummary(500, 207);
    expect(p.profit).toBe(293);
    expect(p.margin_pct).toBe(58.6);
    expect(p.margin_label).toBe('58.6%');
    expect(p.status).toBe('ok');
    expect(p.tone).toBe('green');
  });

  it('NO COST DATA (cost 0) → "—", never a fake 100% margin', () => {
    const p = profitSummary(300, 0);
    expect(p.status).toBe('no_cost_data');
    expect(p.margin_label).toBe('—');
    expect(p.tone).toBe('gray');
    expect(p.margin_pct).toBe(0);
  });

  it('RATE NOT SET → "—" even when a (partial) cost exists', () => {
    const p = profitSummary(500, 80, { ratesComplete: false });
    expect(p.status).toBe('rate_not_set');
    expect(p.margin_label).toBe('—');
    expect(p.tone).toBe('gray');
  });

  it('loss-making job → negative margin, red, real number', () => {
    const p = profitSummary(100, 150);
    expect(p.profit).toBe(-50);
    expect(p.margin_pct).toBe(-50);
    expect(p.margin_label).toBe('-50.0%');
    expect(p.tone).toBe('red');
    expect(p.status).toBe('ok');
  });

  it('cost but no revenue → "—" (margin undefined without revenue)', () => {
    const p = profitSummary(0, 120);
    expect(p.status).toBe('no_revenue');
    expect(p.margin_label).toBe('—');
  });

  it('threshold colors: 30% green, 15% yellow, below red', () => {
    expect(profitSummary(100, 70).tone).toBe('green');   // 30%
    expect(profitSummary(100, 80).tone).toBe('yellow');  // 20%
    expect(profitSummary(100, 90).tone).toBe('red');     // 10%
  });
});

describe('varianceTone', () => {
  it('under budget is green, modest over is yellow, big over is red', () => {
    expect(varianceTone(80, 100)).toBe('green');
    expect(varianceTone(105, 100)).toBe('yellow');
    expect(varianceTone(130, 100)).toBe('red');
  });
});
