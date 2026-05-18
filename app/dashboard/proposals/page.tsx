'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowProposalsWorks } from '@/components/help/how-page-works';
import { EmptyState } from '@/components/shared/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Estimate, EstimateStatus } from '@/types';

const STATUS_CHIPS: Array<{ label: string; value: EstimateStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Declined', value: 'declined' },
  { label: 'Expired', value: 'expired' },
];

const STATUS_COLORS: Record<EstimateStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  converted: 'bg-orange-100 text-orange-700',
};

type ProposalRow = Estimate & {
  client: { id: string; name: string } | null;
  estimate_line_items: Array<{ total: number | null }> | null;
};

export default function ProposalsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EstimateStatus | 'all'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from('estimates')
        .select('*, client:clients(id,name), estimate_line_items(total)')
        .order('created_at', { ascending: false });
      if (filter !== 'all') query = query.eq('status', filter);
      const { data } = await query;
      setProposals((data ?? []) as ProposalRow[]);
      setLoading(false);
    }
    load();
  }, [filter, supabase]);

  return (
    <div>
      <PageHeader
        title="Proposals"
        eyebrow="Build it, send it, win it"
        description="Estimates and proposals — annual contracts and one-off bids."
      >
        <HowProposalsWorks />
        <Link
          href="/dashboard/proposals/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Proposal
        </Link>
      </PageHeader>

      <PageIntro
        id="proposals"
        title="Estimates that close"
        description="Build a polished proposal in three steps: pick the client, add line items, send a PDF. Approved proposals can spawn jobs or recurring contracts in one click."
        steps={[
          'Click + New Proposal and choose: existing client, brand-new client, or measurement.',
          'Add line items from your service catalog or write custom ones.',
          'Send the PDF — when it\'s accepted, convert to job(s) with one button.',
        ]}
      />

      <div className="flex gap-2 flex-wrap mb-5">
        {STATUS_CHIPS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === value
                ? 'text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            style={filter === value ? { backgroundColor: 'var(--orange)' } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter === 'all' ? 'No proposals yet' : `No ${filter} proposals`}
          description="Build your first proposal to send a polished estimate to a client."
          action={{
            label: '+ New Proposal',
            onClick: () => router.push('/dashboard/proposals/new'),
          }}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {proposals.map((p) => {
              const subtotal = (p.estimate_line_items ?? []).reduce(
                (s, li) => s + Number(li.total ?? 0),
                0
              );
              return (
                <div
                  key={p.id}
                  className="rounded-xl border bg-card p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/dashboard/proposals/${p.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.client?.name ?? '—'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                        STATUS_COLORS[p.status]
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCurrency(subtotal)}
                    </span>
                    <span className="tabular-nums">{formatDate(p.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Title</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Client</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Annual</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {proposals.map((p) => {
                  const subtotal = (p.estimate_line_items ?? []).reduce(
                    (s, li) => s + Number(li.total ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => router.push(`/dashboard/proposals/${p.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">{p.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.client?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                            STATUS_COLORS[p.status]
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(subtotal)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {p.annual_value ? formatCurrency(Number(p.annual_value)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {formatDate(p.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
