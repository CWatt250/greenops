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

export default async function ProposalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company (idx_estimates_company_id). Same shape the list renders.
  const { data } = await supabase
    .from('estimates')
    .select('*, client:clients(id,name), estimate_line_items(total)')
    .order('created_at', { ascending: false });
  const proposals = (data ?? []) as ProposalRow[];

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

      <ProposalsView initialProposals={proposals} />
    </div>
  );
}
