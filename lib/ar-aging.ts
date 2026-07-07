/**
 * Accounts-receivable aging: every unpaid invoice bucketed by how far past
 * due it is, rolled up per client. The buckets are the standard ones an
 * accountant (or a bank) asks for.
 */

export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface AgingInvoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  clientName: string;
  due_date: string | null;
  balance_due: number;
}

export interface ClientAging {
  clientName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
  invoices: Array<AgingInvoice & { bucket: AgingBucket; daysPastDue: number }>;
}

/** Days past due (negative = not yet due). No due date = treated as due today. */
export function daysPastDue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  // Noon-pinned to dodge UTC date drift (see audit 2026-06-11).
  const due = new Date(`${dueDate}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  return Math.round((now - due) / 86_400_000);
}

export function bucketFor(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function buildAging(invoices: AgingInvoice[], today: string): {
  clients: ClientAging[];
  totals: Record<AgingBucket, number>;
  grandTotal: number;
} {
  const byClient = new Map<string, ClientAging>();
  const totals: Record<AgingBucket, number> = {
    current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
  };
  let grandTotal = 0;

  for (const inv of invoices) {
    const balance = Number(inv.balance_due ?? 0);
    if (balance <= 0) continue;
    const days = daysPastDue(inv.due_date, today);
    const bucket = bucketFor(days);
    const key = inv.client_id ?? `__none:${inv.clientName}`;
    const row = byClient.get(key) ?? {
      clientName: inv.clientName,
      buckets: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
      total: 0,
      invoices: [],
    };
    row.buckets[bucket] += balance;
    row.total += balance;
    row.invoices.push({ ...inv, bucket, daysPastDue: days });
    byClient.set(key, row);
    totals[bucket] += balance;
    grandTotal += balance;
  }

  const clients = [...byClient.values()].sort((a, b) => b.total - a.total);
  for (const c of clients) {
    c.invoices.sort((a, b) => b.daysPastDue - a.daysPastDue);
  }
  return { clients, totals, grandTotal };
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAgingCsv(aging: ReturnType<typeof buildAging>, today: string): string {
  const header = ['Client', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = aging.clients.map((c) => [
    c.clientName,
    r2(c.buckets.current), r2(c.buckets['1-30']), r2(c.buckets['31-60']),
    r2(c.buckets['61-90']), r2(c.buckets['90+']), r2(c.total),
  ].map(csvEscape).join(','));
  const totalRow = [
    `TOTAL (as of ${today})`,
    r2(aging.totals.current), r2(aging.totals['1-30']), r2(aging.totals['31-60']),
    r2(aging.totals['61-90']), r2(aging.totals['90+']), r2(aging.grandTotal),
  ].map(csvEscape).join(',');
  return [header.map(csvEscape).join(','), ...rows, totalRow].join('\r\n');
}
