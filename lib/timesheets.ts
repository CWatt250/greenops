import { pairClockEvents, type ClockEvent as CostingClockEvent } from '@/lib/job-costing';

/**
 * Timesheet math on top of the clock_events pairing from lib/job-costing.
 * Overtime: weekly hours past 40 (WA has no daily-OT rule for private
 * employers). The workweek is Sunday–Saturday, matching common US payroll.
 */

export const OT_WEEKLY_THRESHOLD_HOURS = 40;

export interface TimesheetEvent extends CostingClockEvent {
  id: string;
  job_id: string;
  flagged?: boolean | null;
  flag_reason?: string | null;
  distance_from_site_m?: number | null;
  reviewed_at?: string | null;
}

export interface MemberInterval {
  profile_id: string;
  job_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  hours: number;
}

export interface MemberTimesheet {
  profile_id: string;
  intervals: MemberInterval[];
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  /** Clock-ins with no matching clock-out — excluded from totals. */
  openIntervals: number;
}

/** Sunday 00:00 local of the week containing `d`. */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function weekEnd(start: Date): Date {
  const e = new Date(start);
  e.setDate(e.getDate() + 7);
  return e;
}

export function buildTimesheets(events: TimesheetEvent[]): Map<string, MemberTimesheet> {
  // Pair per profile *per job* — the pairing helper assumes one job's
  // events; a crew member hopping jobs interleaves ins/outs across jobs.
  const byProfileJob = new Map<string, TimesheetEvent[]>();
  for (const e of events) {
    const k = `${e.profile_id}|${e.job_id}`;
    const arr = byProfileJob.get(k) ?? [];
    arr.push(e);
    byProfileJob.set(k, arr);
  }

  const sheets = new Map<string, MemberTimesheet>();
  for (const [key, evts] of byProfileJob) {
    const [profileId, jobId] = key.split('|');
    const intervals = pairClockEvents(evts);
    const sheet = sheets.get(profileId) ?? {
      profile_id: profileId,
      intervals: [],
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      openIntervals: 0,
    };
    for (const iv of intervals) {
      if (!iv.clocked_out_at) {
        sheet.openIntervals += 1;
        continue;
      }
      const hours =
        (new Date(iv.clocked_out_at).getTime() - new Date(iv.clocked_in_at).getTime()) / 3_600_000;
      if (hours <= 0) continue;
      sheet.intervals.push({
        profile_id: profileId,
        job_id: jobId,
        clocked_in_at: iv.clocked_in_at,
        clocked_out_at: iv.clocked_out_at,
        hours,
      });
      sheet.totalHours += hours;
    }
    sheets.set(profileId, sheet);
  }

  for (const sheet of sheets.values()) {
    sheet.intervals.sort((a, b) => a.clocked_in_at.localeCompare(b.clocked_in_at));
    sheet.regularHours = Math.min(sheet.totalHours, OT_WEEKLY_THRESHOLD_HOURS);
    sheet.overtimeHours = Math.max(0, sheet.totalHours - OT_WEEKLY_THRESHOLD_HOURS);
  }
  return sheets;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payroll CSV — one row per member, hours split regular/OT, the shape
 * Gusto/ADP bulk-hours imports accept after column mapping.
 */
export function buildPayrollCsv(
  sheets: Map<string, MemberTimesheet>,
  names: Map<string, { full_name: string | null; email?: string | null }>,
  periodStart: Date,
  periodEnd: Date,
): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const header = [
    'Employee', 'Email', 'Period Start', 'Period End',
    'Regular Hours', 'Overtime Hours', 'Total Hours', 'Open Punches',
  ];
  const rows = [...sheets.values()]
    .sort((a, b) =>
      (names.get(a.profile_id)?.full_name ?? '').localeCompare(names.get(b.profile_id)?.full_name ?? ''))
    .map((s) => [
      names.get(s.profile_id)?.full_name ?? s.profile_id,
      names.get(s.profile_id)?.email ?? '',
      fmt(periodStart),
      fmt(new Date(periodEnd.getTime() - 86_400_000)), // inclusive end date
      r2(s.regularHours),
      r2(s.overtimeHours),
      r2(s.totalHours),
      s.openIntervals,
    ].map(csvEscape).join(','));
  return [header.map(csvEscape).join(','), ...rows].join('\r\n');
}
