import { notFound } from 'next/navigation';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { PublicProposalView } from '@/components/proposals/public-proposal-view';
import type { Estimate, EstimateLineItem } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * No-login proposal page. The 128-bit token in the URL is the entire
 * authorization; data is fetched with the service role and only the fields
 * a customer should see are passed to the client component.
 */
export default async function PublicProposalPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) notFound();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: proposal } = await admin
    .from('estimates')
    .select(`
      id, title, status, valid_until, notes, tax_rate, annual_value,
      payment_terms, viewed_at, accepted_at, declined_at, acceptance_name,
      client:clients(name, service_address),
      company:companies(name, logo_url, phone, email, tagline)
    `)
    .eq('public_token', token)
    .single();
  if (!proposal) notFound();

  const { data: lineItems } = await admin
    .from('estimate_line_items')
    .select('*')
    .eq('estimate_id', proposal.id)
    .order('sort_order');

  // First open flips "sent" into a tracked view. Best-effort.
  if (!proposal.viewed_at && !['accepted', 'declined'].includes(proposal.status)) {
    void admin
      .from('estimates')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', proposal.id)
      .is('viewed_at', null)
      .then(() => {});
  }

  const p = proposal as unknown as Pick<
    Estimate,
    'id' | 'title' | 'status' | 'valid_until' | 'notes' | 'tax_rate'
    | 'annual_value' | 'payment_terms' | 'accepted_at' | 'declined_at' | 'acceptance_name'
  > & {
    client: { name: string; service_address: string | null } | null;
    company: { name: string; logo_url: string | null; phone: string | null; email: string | null; tagline: string | null } | null;
  };

  return (
    <PublicProposalView
      token={token}
      proposal={{
        title: p.title,
        status: p.status,
        valid_until: p.valid_until ?? null,
        notes: p.notes ?? null,
        tax_rate: Number(p.tax_rate ?? 0),
        annual_value: p.annual_value !== null && p.annual_value !== undefined ? Number(p.annual_value) : null,
        payment_terms: p.payment_terms ?? null,
        accepted_at: p.accepted_at ?? null,
        declined_at: p.declined_at ?? null,
        acceptance_name: p.acceptance_name ?? null,
      }}
      lineItems={(lineItems ?? []) as EstimateLineItem[]}
      client={p.client}
      company={p.company}
    />
  );
}
