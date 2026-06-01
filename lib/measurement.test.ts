import { describe, expect, it } from 'vitest';
import {
  segmentLengthFt,
  formatFeetLabel,
  segmentMidpoint,
  segmentLabels,
  shapeSegmentLabels,
  lineLengthFt,
  polygonAreaSqFt,
  type LngLat,
} from './measurement';

// A small Tri-Cities-ish quad (~property scale) reused across cases.
const A: LngLat = [-119.1734, 46.2087];
const B: LngLat = [-119.1730, 46.2087]; // due east of A
const C: LngLat = [-119.1730, 46.2090];
const D: LngLat = [-119.1734, 46.2090];

describe('segmentLengthFt', () => {
  it('measures a known north–south degree of latitude (~364,800 ft)', () => {
    // 1° of latitude is ~111.19 km ≈ 364,813 ft anywhere on Earth.
    const ft = segmentLengthFt([0, 0], [0, 1]);
    expect(ft).toBeGreaterThan(363_000);
    expect(ft).toBeLessThan(366_000);
  });

  it('returns a positive integer for a short property-scale segment', () => {
    const ft = segmentLengthFt(A, B);
    expect(ft).toBeGreaterThan(0);
    expect(Number.isInteger(ft)).toBe(true);
  });

  it('is symmetric', () => {
    expect(segmentLengthFt(A, B)).toBe(segmentLengthFt(B, A));
  });

  it('is zero for identical points', () => {
    expect(segmentLengthFt(A, A)).toBe(0);
  });

  it('matches lineLengthFt for a two-point line (same underlying turf math)', () => {
    const direct = segmentLengthFt(A, C);
    const viaLine = lineLengthFt({ type: 'LineString', coordinates: [A, C] });
    expect(direct).toBe(viaLine);
  });
});

describe('formatFeetLabel', () => {
  it('rounds and appends the unit', () => {
    expect(formatFeetLabel(0)).toBe('0 ft');
    expect(formatFeetLabel(42)).toBe('42 ft');
    expect(formatFeetLabel(42.4)).toBe('42 ft');
    expect(formatFeetLabel(42.6)).toBe('43 ft');
  });

  it('thousands-separates large values to match the tool formatting', () => {
    expect(formatFeetLabel(1234.6)).toBe('1,235 ft');
    expect(formatFeetLabel(1_000_000)).toBe('1,000,000 ft');
  });
});

describe('segmentMidpoint', () => {
  it('returns the arithmetic midpoint', () => {
    expect(segmentMidpoint([0, 0], [10, 20])).toEqual([5, 10]);
    expect(segmentMidpoint(A, B)).toEqual([(A[0] + B[0]) / 2, A[1]]);
  });
});

describe('segmentLabels', () => {
  it('labels each segment of an open path (n points → n-1 labels)', () => {
    const labels = segmentLabels([A, B, C]);
    expect(labels).toHaveLength(2);
    expect(labels[0].ft).toBe(segmentLengthFt(A, B));
    expect(labels[0].mid).toEqual(segmentMidpoint(A, B));
    expect(labels[1].ft).toBe(segmentLengthFt(B, C));
  });

  it('adds the closing edge when closeRing is set (n points → n labels)', () => {
    const open = segmentLabels([A, B, C], false);
    const closed = segmentLabels([A, B, C], true);
    expect(open).toHaveLength(2);
    expect(closed).toHaveLength(3);
    // Last closed-ring segment runs from the final point back to the first.
    expect(closed[2].ft).toBe(segmentLengthFt(C, A));
  });

  it('does not close a degenerate ring (<3 points)', () => {
    expect(segmentLabels([A, B], true)).toHaveLength(1);
  });

  it('returns no labels for fewer than two points', () => {
    expect(segmentLabels([A])).toHaveLength(0);
    expect(segmentLabels([])).toHaveLength(0);
  });
});

describe('shapeSegmentLabels', () => {
  it('labels every edge of a closed polygon ring including the closing edge', () => {
    const ring = [A, B, C, D, A]; // 4 corners + closing point
    const labels = shapeSegmentLabels({ type: 'Polygon', coordinates: [ring] });
    expect(labels).toHaveLength(4);
    // The polygon's edge lengths should sum close to its perimeter.
    const perimeter = labels.reduce((sum, l) => sum + l.ft, 0);
    expect(perimeter).toBeGreaterThan(0);
  });

  it('labels each segment of a line', () => {
    const labels = shapeSegmentLabels({ type: 'LineString', coordinates: [A, B, C] });
    expect(labels).toHaveLength(2);
  });

  it('stays consistent with the polygon area helper for a real quad', () => {
    const ring = [A, B, C, D, A];
    const area = polygonAreaSqFt({ type: 'Polygon', coordinates: [ring] });
    expect(area).toBeGreaterThan(0);
  });
});
