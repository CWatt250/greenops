/**
 * Per-company timezone helpers for server code (crons run in UTC).
 * companies.timezone is an IANA name; default America/Los_Angeles.
 */
export const DEFAULT_TZ = 'America/Los_Angeles';

export const US_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles, Seattle)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

function safeTz(tz: string | null | undefined): string {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz ?? DEFAULT_TZ });
    return tz ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** YYYY-MM-DD of `d` as seen in `tz`. */
export function dateStrInTz(d: Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeTz(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Local hour (0–23) of `d` in `tz`. */
export function hourInTz(d: Date, tz: string | null | undefined): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: safeTz(tz), hour: 'numeric', hour12: false }).format(d);
  return Number(h) % 24;
}

/** Add days to a YYYY-MM-DD string (calendar arithmetic, no tz drift). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** "Tue, Sep 8" from YYYY-MM-DD. */
export function formatDayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "8:00 AM" from "08:00:00". */
export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${`${m ?? 0}`.padStart(2, '0')} ${suffix}`;
}
