export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { HowProposalsWorks } from '@/components/help/how-page-works';
import { ProposalsView, type ProposalRow } from '@/components/proposals/proposals-view';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { EstimateStatus } from '@/types';
import { parseListParams, ilikePattern, inList, type SearchParams } from '@/lib/list-params';

const ESTIMATE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired', 'converted'] as const satisfies readonly EstimateStatus[];

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = parseListParams(await searchParams, ESTIMATE_STATUSES);

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company (idx_estimates_company_id). Status, search, and paging run
  // here so the list stays under PostgREST's 1,000-row cap.
  let query = supabase
    .from('estimates')
    .select('*, client:clients(id,name), estimate_line_items(total)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (params.status !== 'all') query = query.eq('status', params.status);
  if (params.q) {
    const pattern = ilikePattern(params.q);
    const { data: matches } = await supabase.from('clients').select('id').ilike('name', pattern).limit(100);
    const ids = inList((matches ?? []).map((c) => c.id));
    query = ids ? query.or(`title.ilike.${pattern},client_id.in.(${ids})`) : query.ilike('title', pattern);
  }
  const { data, count } = await query.range(params.from, params.to);
  const proposals = (data ?? []) as ProposalRow[];
  const total = count ?? proposals.length;

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

      <ProposalsView
        key={`${params.page}|${params.status}|${params.q}`}
        initialProposals={proposals}
        total={total}
        page={params.page}
        status={params.status}
        q={params.q}
      />
    </div>
  );
}
