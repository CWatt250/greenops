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
import type { Invoice } from '@/types';

type InvoiceWithClient = Invoice & { client: { name: string } | null };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company (idx_invoices_company_id). Same shape the table renders.
  const { data } = await supabase
    .from('invoices')
    .select('*, client:clients(name)')
    .order('created_at', { ascending: false });

  // Mark overdue invoices (UTC date cutoff, same as before — no tz drift).
  const now = localDateStr();
  const invoices = (data ?? []).map((inv) => ({
    ...inv,
    status: (
      inv.status !== 'paid' &&
      inv.status !== 'cancelled' &&
      inv.due_date &&
      inv.due_date < now
    ) ? 'overdue' : inv.status,
  })) as InvoiceWithClient[];

  // Summary strip — derived from the full set, rendered server-side.
  const totalOutstanding = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + i.balance_due, 0);
  const totalOverdue = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((s, i) => s + i.balance_due, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const totalPaidThisMonth = invoices
    .filter((i) => i.status === 'paid' && i.paid_at?.startsWith(thisMonth))
    .reduce((s, i) => s + i.total, 0);

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

      <InvoicesView invoices={invoices} />
    </div>
  );
}
