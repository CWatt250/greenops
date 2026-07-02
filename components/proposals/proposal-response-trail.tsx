/* eslint-disable @next/next/no-img-element */

import { Link2, Eye, CheckCircle2, XCircle } from 'lucide-react';
import type { Estimate } from '@/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

/** Staff-facing trail of what the customer did with the shared link. */
export function ProposalResponseTrail({ proposal }: { proposal: Estimate }) {
  const hasAnything =
    proposal.public_token || proposal.viewed_at || proposal.accepted_at || proposal.declined_at;
  if (!hasAnything) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
        Customer Response
      </p>
      <ul className="space-y-1.5 text-xs">
        {proposal.public_token_created_at && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            Link shared {when(proposal.public_token_created_at)}
            {!proposal.public_token && <span className="text-amber-600">(revoked)</span>}
          </li>
        )}
        {proposal.viewed_at && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Viewed by customer {when(proposal.viewed_at)}
          </li>
        )}
        {proposal.accepted_at && (
          <li className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Accepted {when(proposal.accepted_at)}
            {proposal.acceptance_name && <> — signed by {proposal.acceptance_name}</>}
          </li>
        )}
        {proposal.declined_at && (
          <li className="flex items-start gap-2 text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Declined {when(proposal.declined_at)}
              {proposal.decline_reason && (
                <> — &ldquo;{proposal.decline_reason}&rdquo;</>
              )}
            </span>
          </li>
        )}
      </ul>
      {proposal.acceptance_signature && (
        <div className="mt-2.5">
          <img
            src={proposal.acceptance_signature}
            alt={`Signature of ${proposal.acceptance_name ?? 'customer'}`}
            className="max-h-16 w-auto rounded border bg-white p-1.5"
          />
        </div>
      )}
    </div>
  );
}
