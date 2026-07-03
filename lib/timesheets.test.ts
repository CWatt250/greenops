import { describe, it, expect } from 'vitest';
import { buildTimesheets, buildPayrollCsv, weekStart, type TimesheetEvent } from './timesheets';
import { distanceMeters } from './geo';

function ev(
  profile: string, job: string, type: 'clock_in' | 'clock_out', iso: string,
): TimesheetEvent {
  return { id: `${profile}-${iso}`, profile_id: profile, job_id: job, event_type: type, created_at: iso };
}

describe('buildTimesheets', () => {
  it('pairs per job and totals hours', () => {
    const sheets = buildTimesheets([
      ev('u1', 'j1', 'clock_in', '2026-06-29T08:00:00Z'),
      ev('u1', 'j1', 'clock_out', '2026-06-29T12:00:00Z'),
      ev('u1', 'j2', 'clock_in', '2026-06-29T13:00:00Z'),
      ev('u1', 'j2', 'clock_out', '2026-06-29T17:30:00Z'),
    ]);
    const s = sheets.get('u1')!;
    expect(s.totalHours).toBeCloseTo(8.5);
    expect(s.intervals).toHaveLength(2);
    expect(s.overtimeHours).toBe(0);
    expect(s.openIntervals).toBe(0);
  });

  it('interleaved jobs across members do not cross-pair', () => {
    const sheets = buildTimesheets([
      ev('u1', 'j1', 'clock_in', '2026-06-29T08:00:00Z'),
      ev('u2', 'j1', 'clock_in', '2026-06-29T08:05:00Z'),
      ev('u1', 'j1', 'clock_out', '2026-06-29T10:00:00Z'),
      ev('u2', 'j1', 'clock_out', '2026-06-29T11:05:00Z'),
    ]);
    expect(sheets.get('u1')!.totalHours).toBeCloseTo(2);
    expect(sheets.get('u2')!.totalHours).toBeCloseTo(3);
  });

  it('splits weekly overtime at 40h', () => {
    const events: TimesheetEvent[] = [];
    // 5 days × 9h = 45h
    for (let d = 0; d < 5; d++) {
      events.push(ev('u1', 'j1', 'clock_in', `2026-06-2${9 - d}T08:00:00Z`));
      events.push(ev('u1', 'j1', 'clock_out', `2026-06-2${9 - d}T17:00:00Z`));
    }
    const s = buildTimesheets(events).get('u1')!;
    expect(s.totalHours).toBeCloseTo(45);
    expect(s.regularHours).toBe(40);
    expect(s.overtimeHours).toBeCloseTo(5);
  });

  it('open punches counted, excluded from totals', () => {
    const s = buildTimesheets([
      ev('u1', 'j1', 'clock_in', '2026-06-29T08:00:00Z'),
    ]).get('u1')!;
    expect(s.totalHours).toBe(0);
    expect(s.openIntervals).toBe(1);
  });
});

describe('buildPayrollCsv', () => {
  it('one row per member with escaped names', () => {
    const sheets = buildTimesheets([
      ev('u1', 'j1', 'clock_in', '2026-06-29T08:00:00Z'),
      ev('u1', 'j1', 'clock_out', '2026-06-29T16:00:00Z'),
    ]);
    const csv = buildPayrollCsv(
      sheets,
      new Map([['u1', { full_name: 'Crew, Pat "PJ"', email: 'pat@tlc.com' }]]),
      new Date('2026-06-28T00:00:00'),
      new Date('2026-07-05T00:00:00'),
    );
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('Overtime Hours');
    expect(row).toContain('"Crew, Pat ""PJ"""');
    expect(row).toContain('pat@tlc.com');
    expect(row).toContain('8');
  });
});

describe('weekStart', () => {
  it('snaps to Sunday 00:00 local', () => {
    const s = weekStart(new Date('2026-07-02T15:30:00')); // Thursday
    expect(s.getDay()).toBe(0);
    expect(s.getHours()).toBe(0);
    expect(s.getDate()).toBe(28); // Sun Jun 28, 2026
  });
});

describe('distanceMeters', () => {
  it('zero for identical points', () => {
    expect(distanceMeters(46.2087, -119.1734, 46.2087, -119.1734)).toBe(0);
  });
  it('~157m for 1e-3 deg lat + 1e-3 deg lng at mid-latitude', () => {
    const d = distanceMeters(46.2087, -119.1734, 46.2097, -119.1724);
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(180);
  });
});
