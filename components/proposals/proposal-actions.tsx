'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Send, FileDown, ThumbsUp, ThumbsDown, Trash2, Loader2, Briefcase, Link2, LinkIcon, Mail } from 'lucide-react';
import type { Estimate, EstimateLineItem, EstimateStatus } from '@/types';
import { annualValue, lineTotal, type LineItemDraft } from '@/lib/proposal-pricing';

interface Props {
  proposal: Estimate & { client?: { name: string; service_address?: string | null } | null };
  lineItems: EstimateLineItem[];
}

export function ProposalActions({ proposal, lineItems }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function shareLink() {
    setBusy('share');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/share`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Could not create the link.');
        return;
      }
      try {
        await navigator.clipboard.writeText(json.url);
        toast.success('Public link copied — text or email it to the client. They can view, sign, and accept without logging in.');
      } catch {
        toast.message(`Public link: ${json.url}`);
      }
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function emailLink() {
    setBusy('email');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Could not send the proposal.');
        return;
      }
      if (json.emailed) {
        toast.success('Proposal emailed to the client. They can review, sign, and accept from the link.');
      } else if (json.reason === 'no-email') {
        toast.error('This client has no email on file — link copied instead.');
        try { await navigator.clipboard.writeText(json.url); } catch { /* fine */ }
      } else {
        toast.message(`Email delivery isn’t configured — link copied: ${json.url}`);
        try { await navigator.clipboard.writeText(json.url); } catch { /* fine */ }
      }
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function revokeLink() {
    setBusy('revoke');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/share`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not revoke the link.');
        return;
      }
      toast.success('Link revoked — the public page is dead.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: EstimateStatus) {
    setBusy(status);
    const { error } = await supabase
      .from('estimates')
      .update({ status })
      .eq('id', proposal.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked as ${status}.`);
    router.refresh();
  }

  async function handleDelete() {
    const { error } = await supabase.from('estimates').delete().eq('id', proposal.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Proposal deleted.');
    router.push('/dashboard/proposals');
    router.refresh();
  }

  async function downloadPdf() {
    setBusy('pdf');
    try {
      const [{ pdf }, { ProposalDocument }, { fetchOwnCompany, FALLBACK_COMPANY }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/proposal-pdf'),
        import('@/lib/company-client'),
        import('react'),
      ]);

      // Compute annual value from line items + proposal flags
      const flags = {
        property_complexity: (proposal.property_complexity ?? 'simple') as 'simple' | 'moderate' | 'complex',
        has_slopes: !!proposal.has_slopes,
        has_dogs: !!proposal.has_dogs,
        has_obstacles: !!proposal.has_obstacles,
      };
      const drafts: LineItemDraft[] = lineItems.map((li) => ({
        service_id: li.service_id ?? null,
        description: li.description,
        quantity: Number(li.quantity ?? 0),
        unit_price: Number(li.unit_price ?? 0),
        markup_pct: Number(li.markup_pct ?? 0),
        discount_pct: Number(li.discount_pct ?? 0),
        frequency: (li.frequency ?? 'one_time') as LineItemDraft['frequency'],
        frequency_discount_pct: Number(li.frequency_discount_pct ?? 0),
      }));
      const annual = proposal.annual_value
        ? Number(proposal.annual_value)
        : annualValue(drafts, flags);

      const company = (await fetchOwnCompany()) ?? FALLBACK_COMPANY;

      const doc = React.default.createElement(ProposalDocument, {
        proposal,
        lineItems,
        annualValue: annual,
        company,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Proposal-${proposal.title.replace(/[^a-z0-9-]+/gi, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF generation failed.');
    } finally {
      setBusy(null);
    }
  }

  async function convertToJob() {
    setBusy('convert');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/convert`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Conversion failed.');
        return;
      }
      toast.success('Job created from proposal.');
      router.push(`/dashboard/jobs/${json.job_id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Network error');
    } finally {
      setBusy(null);
    }
  }

  // Helpers to silence unused-import warnings
  void lineTotal;

  const status = proposal.status;
  const isFinal = status === 'declined' || status === 'expired' || status === 'converted';

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={downloadPdf}
          disabled={busy !== null}
          className="gap-1.5"
        >
          {busy === 'pdf'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <FileDown className="h-3.5 w-3.5" />}
          PDF
        </Button>
        {status === 'draft' && (
          <Button
            size="sm"
            onClick={emailLink}
            disabled={busy !== null}
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            className="gap-1.5"
            title="Emails the client a no-login link to review, sign, and accept (copies the link if email isn't available)"
          >
            {busy === 'email'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Send
          </Button>
        )}
        {status === 'sent' && (
          <>
          <Button
            variant={proposal.public_token ? 'outline' : 'default'}
            size="sm"
            onClick={shareLink}
            disabled={busy !== null}
            className="gap-1.5"
            style={proposal.public_token ? undefined : { backgroundColor: 'var(--orange)', color: '#fff' }}
            title={proposal.public_token ? 'Copy the client-facing link again' : 'Create the client-facing link'}
          >
            {busy === 'share'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <LinkIcon className="h-3.5 w-3.5" />}
            {proposal.public_token ? 'Copy Link' : 'Create Link'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={emailLink}
            disabled={busy !== null}
            className="gap-1.5"
            title="Email the client a link to review and sign"
          >
            {busy === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Email to Client
          </Button>
          </>
        )}
        {proposal.public_token && !isFinal && status !== 'accepted' && (
          <Button
            variant="outline"
            size="sm"
            onClick={revokeLink}
            disabled={busy !== null}
            className="gap-1.5 text-muted-foreground"
            title="Kill the public link"
          >
            {busy === 'revoke'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Link2 className="h-3.5 w-3.5" />}
            Revoke
          </Button>
        )}
        {(status === 'sent' || status === 'draft') && !isFinal && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus('accepted')}
              disabled={busy !== null}
              className="gap-1.5"
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus('declined')}
              disabled={busy !== null}
              className="gap-1.5"
            >
              <ThumbsDown className="h-3.5 w-3.5" /> Decline
            </Button>
          </>
        )}
        {status === 'accepted' && (
          <Button
            size="sm"
            onClick={convertToJob}
            disabled={busy !== null}
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            className="gap-1.5"
            title="Create a job from this accepted proposal"
          >
            {busy === 'convert'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Briefcase className="h-3.5 w-3.5" />}
            Convert to Job
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          title="Delete proposal"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${proposal.title}"?`}
        description="Removes this proposal and its line items. Cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
