/**
 * Server-side list paging. Every list page (jobs, clients, invoices,
 * proposals) used to fetch the whole table and filter in memory — fine at
 * 174 jobs, but PostgREST caps a response at `max_rows = 1000`, so a real
 * customer would silently lose older rows after about six weeks. These
 * helpers turn `?q=&status=&page=` into a bounded `.range()` query.
 */
export const PAGE_SIZE = 50;

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<S extends string> {
  page: number;
  q: string;
  status: S | 'all';
  from: number;
  to: number;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseListParams<S extends string>(
  sp: SearchParams,
  statuses: readonly S[],
): ListParams<S> {
  const page = Math.max(1, parseInt(first(sp.page) ?? '1', 10) || 1);
  const q = (first(sp.q) ?? '').trim().slice(0, 100);
  const rawStatus = first(sp.status) ?? 'all';
  const status = (statuses as readonly string[]).includes(rawStatus) ? (rawStatus as S) : 'all';
  return { page, q, status, from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 };
}

/**
 * Free text → a safe ILIKE pattern. Escapes SQL wildcards and strips the
 * characters that would break a PostgREST `.or()` filter string.
 */
export function ilikePattern(q: string): string {
  const cleaned = q.replace(/[%_\\]/g, '\\$&').replace(/[,()"]/g, ' ').trim();
  return `%${cleaned}%`;
}

/** Comma list for a PostgREST `in.(…)` clause (UUIDs only, so no quoting). */
export function inList(ids: string[]): string {
  return ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).join(',');
}
