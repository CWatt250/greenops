export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { localDateStr } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { InvoicesView } from '@/components/billing/invoices-view';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@/types';
import { parseListParams, ilikePattern, inList, type SearchParams } from '@/lib/list-params';

type InvoiceWithClient = Invoice & { client: { name: string } | null };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const INVOICE_STATUSES = ['draft', 'sent', 'overdue', 'partial', 'paid', 'cancelled'] as const satisfies readonly InvoiceStatus[];
const OPEN = '("paid","cancelled")'; // statuses that can never be overdue

/**
 * "Overdue" is derived, not stored: any unpaid, uncancelled invoice past its
 * due date. The tab filters and the summary tiles all use this one definition
 * so the counts agree with the rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withStatus<T extends { eq: any; not: any; lt: any; or: any }>(q: T, status: InvoiceStatus | 'all', today: string): T {
  if (status === 'all') return q;
  if (status === 'overdue') return q.not('status', 'in', OPEN).lt('due_date', today);
  if (status === 'paid' || status === 'cancelled') return q.eq('status', status);
  return q.eq('status', status).or(`due_date.is.null,due_date.gte.${today}`);
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = parseListParams(await searchParams, INVOICE_STATUSES);
  const today = localDateStr();
  const monthStart = `${today.slice(0, 7)}-01`;

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company (idx_invoices_company_id). Status, search, and paging run
  // here so the list stays under PostgREST's 1,000-row cap.
  let query = withStatus(
    supabase.from('invoices').select('*, client:clients(name)', { count: 'exact' }),
    params.status,
    today,
  ).order('created_at', { ascending: false });
  if (params.q) {
    const pattern = ilikePattern(params.q);
    const { data: matches } = await supabase.from('clients').select('id').ilike('name', pattern).limit(100);
    const ids = inList((matches ?? []).map((c) => c.id));
    query = ids ? query.or(`invoice_number.ilike.${pattern},client_id.in.(${ids})`) : query.ilike('invoice_number', pattern);
  }
  const countFor = (status: InvoiceStatus | 'all') =>
    withStatus(supabase.from('invoices').select('id', { count: 'exact', head: true }), status, today);

  const [
    { data, count },
    { count: allCount }, { count: draftCount }, { count: sentCount }, { count: overdueCount }, { count: partialCount }, { count: paidCount },
    { data: openRows }, { data: paidRows },
  ] = await Promise.all([
    query.range(params.from, params.to),
    countFor('all'), countFor('draft'), countFor('sent'), countFor('overdue'), countFor('partial'), countFor('paid'),
    // Summary tiles: narrow columns over the bounded open set and this
    // month's paid set, instead of the whole table.
    supabase.from('invoices').select('balance_due, due_date').not('status', 'in', OPEN),
    supabase.from('invoices').select('total').eq('status', 'paid').gte('paid_at', monthStart),
  ]);

  // Mark derived overdue on the rows we render.
  const now = today;
  const invoices = (data ?? []).map((inv) => ({
    ...inv,
    status: (
      inv.status !== 'paid' &&
      inv.status !== 'cancelled' &&
      inv.due_date &&
      inv.due_date < now
    ) ? 'overdue' : inv.status,
  })) as InvoiceWithClient[];

  const total = count ?? invoices.length;
  const counts: Record<string, number> = {
    all: allCount ?? 0, draft: draftCount ?? 0, sent: sentCount ?? 0,
    overdue: overdueCount ?? 0, partial: partialCount ?? 0, paid: paidCount ?? 0,
  };

  // Summary strip — from the bounded open + paid-this-month sets.
  const open = (openRows ?? []) as Array<{ balance_due: number; due_date: string | null }>;
  const totalOutstanding = open.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const totalOverdue = open
    .filter((i) => i.due_date && i.due_date < now)
    .reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const totalPaidThisMonth = ((paidRows ?? []) as Array<{ total: number }>)
    .reduce((s, i) => s + Number(i.total ?? 0), 0);

  return (
    <div>
      <PageHeader title="Invoices" description="Billing and payment tracking">
        <Link
          href="/dashboard/invoices/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Link>
      </PageHeader>

      <PageIntro
        id="invoices"
        title="Bill and collect"
        description="Track outstanding balances, generate PDF invoices for any completed job, and mark payment when it lands."
        steps={[
          'Outstanding / Paid / Overdue tiles up top show health at a glance.',
          'Click + New Invoice to build one from scratch, or use the "Invoice this job" action on any complete job.',
          'Mark Paid records the payment and clears the invoice from Outstanding.',
        ]}
      />

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-xl font-bold mt-1">{fmt(totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-red-500 font-medium">Overdue</p>
          <p className={cn('text-xl font-bold mt-1', totalOverdue > 0 && 'text-red-600')}>
            {fmt(totalOverdue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Paid This Month</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(totalPaidThisMonth)}</p>
        </div>
      </div>

      <InvoicesView
        key={`${params.page}|${params.status}|${params.q}`}
        invoices={invoices}
        counts={counts}
        total={total}
        page={params.page}
        q={params.q}
      />
    </div>
  );
}
