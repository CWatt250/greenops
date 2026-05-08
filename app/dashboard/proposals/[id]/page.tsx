export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ProposalActions } from '@/components/proposals/proposal-actions';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { FREQUENCY_LABELS } from '@/lib/proposal-pricing';
import type { Estimate, EstimateLineItem, EstimateStatus } from '@/types';

const STATUS_COLORS: Record<EstimateStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [proposalRes, lineItemsRes] = await Promise.all([
    supabase
      .from('estimates')
      .select('*, client:clients(name, service_address, phone, email)')
      .eq('id', id)
      .single(),
    supabase
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order'),
  ]);

  if (proposalRes.error || !proposalRes.data) notFound();

  const proposal = proposalRes.data as Estimate & {
    client: { name: string; service_address?: string | null; phone?: string | null; email?: string | null } | null;
  };
  const lineItems = (lineItemsRes.data ?? []) as EstimateLineItem[];

  const subtotal = lineItems.reduce((s, li) => s + Number(li.total ?? 0), 0);
  const taxAmount = subtotal * (Number(proposal.tax_rate ?? 0) / 100);
  const grandTotal = subtotal + taxAmount;

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/proposals"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Proposals
      </Link>

      <header className="flex items-start justify-between gap-4 border-b pb-4 mb-5">
        <div>
          <p
            className="page-eyebrow"
            style={{ fontFamily: 'var(--font-hand), cursive', color: 'var(--orange)', fontSize: 18, fontWeight: 700 }}
          >
            Proposal · {formatDate(proposal.created_at)}
          </p>
          <h1 className="page-title" style={{ fontSize: 28 }}>{proposal.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                STATUS_COLORS[proposal.status]
              )}
            >
              {proposal.status}
            </span>
            {proposal.valid_until && (
              <span className="text-xs text-muted-foreground">
                Valid through {formatDate(proposal.valid_until)}
              </span>
            )}
          </div>
        </div>
        <ProposalActions proposal={proposal} lineItems={lineItems} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
            Client
          </p>
          <p className="text-sm font-bold">{proposal.client?.name ?? '—'}</p>
          {proposal.client?.service_address && (
            <p className="text-xs text-muted-foreground mt-0.5">{proposal.client.service_address}</p>
          )}
          {proposal.client?.email && (
            <p className="text-xs text-muted-foreground">{proposal.client.email}</p>
          )}
          {proposal.client?.phone && (
            <p className="text-xs text-muted-foreground">{proposal.client.phone}</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
            Property
          </p>
          <p className="text-sm">
            Complexity: <span className="font-semibold capitalize">{proposal.property_complexity ?? 'simple'}</span>
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {proposal.has_slopes && <span className="text-[10px] rounded-full bg-muted px-2 py-0.5">Slopes</span>}
            {proposal.has_dogs && <span className="text-[10px] rounded-full bg-muted px-2 py-0.5">Dogs</span>}
            {proposal.has_obstacles && <span className="text-[10px] rounded-full bg-muted px-2 py-0.5">Obstacles</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Payment terms: <span className="text-foreground font-medium">{proposal.payment_terms ?? 'Net 30'}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Service</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Frequency</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Qty × $</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lineItems.map((li) => (
              <tr key={li.id}>
                <td className="px-4 py-3">{li.description}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {li.frequency ? FREQUENCY_LABELS[li.frequency] : 'One-time'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {Number(li.quantity)} × {formatCurrency(Number(li.unit_price))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatCurrency(Number(li.total ?? 0))}
                </td>
              </tr>
            ))}
            {lineItems.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center px-4 py-6 text-muted-foreground italic">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {Number(proposal.tax_rate ?? 0) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Tax ({Number(proposal.tax_rate)}%)</span>
            <span className="tabular-nums">{formatCurrency(taxAmount)}</span>
          </div>
        )}
        <div
          className="flex justify-between text-white font-bold rounded-md px-3 py-2 mt-1"
          style={{ backgroundColor: 'var(--orange)' }}
        >
          <span>Total per visit</span>
          <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
        </div>
        {proposal.annual_value && Number(proposal.annual_value) > 0 && (
          <div
            className="flex justify-between font-bold rounded-md px-3 py-2"
            style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}
          >
            <span>Annual value</span>
            <span className="tabular-nums">{formatCurrency(Number(proposal.annual_value))}</span>
          </div>
        )}
      </div>

      {proposal.notes && (
        <div className="rounded-xl border bg-muted/30 p-4 mt-6">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
            Notes
          </p>
          <p className="text-sm whitespace-pre-wrap">{proposal.notes}</p>
        </div>
      )}
    </div>
  );
}
