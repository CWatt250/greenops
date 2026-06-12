/**
 * Date-string helpers that stay in LOCAL time.
 *
 * `new Date().toISOString().split('T')[0]` derives the date in UTC, which is
 * tomorrow every evening for anyone west of Greenwich (Pacific: from 4–5 PM).
 * That drift made the route builder default to tomorrow, the dispatch view
 * show zero jobs at night, and invoices stamp tomorrow's issue date — while
 * the crew's /today (already local) disagreed with all of them. Derive
 * calendar dates from local wall-clock parts instead, and only ever compare
 * them against other local date strings.
 */

/** YYYY-MM-DD for `d` (default: now) in the user's local timezone. */
export function localDateStr(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** YYYY-MM-DD for `days` days from now (negative = past), local timezone. */
export function localDateStrOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}
