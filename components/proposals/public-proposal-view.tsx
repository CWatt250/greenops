'use client';

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react';
import { SignaturePad, type SigCanvasType } from '@/components/shared/signature-pad';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Trash2, PenLine } from 'lucide-react';
import type { EstimateLineItem, EstimateStatus } from '@/types';

interface Props {
  token: string;
  proposal: {
    title: string;
    status: EstimateStatus;
    valid_until: string | null;
    notes: string | null;
    tax_rate: number;
    annual_value: number | null;
    payment_terms: string | null;
    accepted_at: string | null;
    declined_at: string | null;
    acceptance_name: string | null;
  };
  lineItems: EstimateLineItem[];
  client: { name: string; service_address: string | null } | null;
  company: { name: string; logo_url: string | null; phone: string | null; email: string | null; tagline: string | null } | null;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function PublicProposalView({ token, proposal, lineItems, client, company }: Props) {
  const sigRef = useRef<SigCanvasType>(null);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [name, setName] = useState('');
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<'accepted' | 'declined' | null>(
    proposal.status === 'accepted' || proposal.status === 'converted' ? 'accepted'
    : proposal.status === 'declined' ? 'declined'
    : null,
  );

  const expired = !finalStatus && !!proposal.valid_until
    && proposal.valid_until < new Date().toISOString().slice(0, 10);

  const perVisit = lineItems.filter((li) => li.billing_mode !== 'per_month');
  const perMonth = lineItems.filter((li) => li.billing_mode === 'per_month');
  const subtotal = perVisit.reduce((s, li) => s + Number(li.total ?? 0), 0);
  const monthlyTotal = perMonth.reduce((s, li) => s + Number(li.monthly_rate ?? li.total ?? 0), 0);
  const taxAmount = subtotal * Number(proposal.tax_rate ?? 0);
  const grandTotal = subtotal + taxAmount;

  async function respond(action: 'accept' | 'decline') {
    setError(null);
    if (action === 'accept') {
      if (!name.trim()) { setError('Please type your name.'); return; }
      if (sigRef.current?.isEmpty() ?? true) { setError('Please sign in the box above.'); return; }
    }
    setBusy(action);
    try {
      const payload = action === 'accept'
        ? {
            action,
            name: name.trim(),
            signature: sigRef.current!.getTrimmedCanvas().toDataURL('image/png'),
          }
        : { action, reason: declineReason.trim() };
      const res = await fetch(`/api/public/proposals/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Something went wrong — please try again.'); return; }
      setFinalStatus(action === 'accept' ? 'accepted' : 'declined');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-brand-cream-raw)' }}>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
        {/* Company header */}
        <div className="text-center space-y-1.5">
          {company?.logo_url && (
            <img src={company.logo_url} alt={company.name} className="mx-auto h-14 w-auto object-contain" />
          )}
          <h1 className="text-lg font-bold text-gray-900">{company?.name ?? 'Proposal'}</h1>
          {company?.tagline && <p className="text-xs italic text-gray-500">{company.tagline}</p>}
        </div>

        {/* Proposal card */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold">Proposal for</p>
            <p className="text-white font-bold">{client?.name ?? 'You'}</p>
            {client?.service_address && (
              <p className="text-xs text-white/80">{client.service_address}</p>
            )}
          </div>

          <div className="px-5 py-4 space-y-4">
            <h2 className="text-base font-bold text-gray-900">{proposal.title}</h2>

            {/* Line items */}
            <div className="divide-y">
              {lineItems.map((li) => (
                <div key={li.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-800">{li.description}</p>
                    <p className="text-xs text-gray-500">
                      {Number(li.quantity) !== 1 ? `${Number(li.quantity)} × ${fmt(Number(li.unit_price))}` : fmt(Number(li.unit_price))}
                      {li.frequency && li.frequency !== 'one_time' ? ` · ${li.frequency}` : ''}
                      {li.billing_mode === 'per_month' ? ' · billed monthly' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
                    {li.billing_mode === 'per_month'
                      ? `${fmt(Number(li.monthly_rate ?? li.total ?? 0))}/mo`
                      : fmt(Number(li.total ?? 0))}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-1 text-sm">
              {perVisit.length > 0 && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span><span className="tabular-nums">{fmt(subtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax ({(Number(proposal.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)</span>
                      <span className="tabular-nums">{fmt(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>Total</span><span className="tabular-nums">{fmt(grandTotal)}</span>
                  </div>
                </>
              )}
              {perMonth.length > 0 && (
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Monthly</span><span className="tabular-nums">{fmt(monthlyTotal)}/mo</span>
                </div>
              )}
              {proposal.annual_value !== null && proposal.annual_value > 0 && (
                <div className="flex justify-between text-xs text-gray-500 pt-1 border-t">
                  <span>Estimated annual value</span>
                  <span className="tabular-nums">{fmt(proposal.annual_value)}</span>
                </div>
              )}
            </div>

            {proposal.payment_terms && (
              <p className="text-xs text-gray-500">Payment terms: {proposal.payment_terms}</p>
            )}
            {proposal.notes && (
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{proposal.notes}</p>
            )}
            {proposal.valid_until && !expired && !finalStatus && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Valid through {new Date(`${proposal.valid_until}T12:00`).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        {/* Response area */}
        {finalStatus === 'accepted' ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-1.5" />
            <p className="text-sm font-semibold text-green-800">Proposal accepted</p>
            <p className="text-xs text-green-700 mt-0.5">
              {proposal.acceptance_name || name
                ? `Signed by ${proposal.acceptance_name ?? name}. `
                : ''}
              {company?.name ?? 'We'} will be in touch to get you scheduled. Thank you!
            </p>
          </div>
        ) : finalStatus === 'declined' ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-center">
            <XCircle className="h-8 w-8 text-gray-400 mx-auto mb-1.5" />
            <p className="text-sm font-semibold text-gray-700">Proposal declined</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Changed your mind? Give {company?.name ?? 'us'} a call
              {company?.phone ? ` at ${company.phone}` : ''}.
            </p>
          </div>
        ) : expired ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
            <Clock className="h-8 w-8 text-amber-500 mx-auto mb-1.5" />
            <p className="text-sm font-semibold text-amber-800">This proposal has expired</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Contact {company?.name ?? 'us'}{company?.phone ? ` at ${company.phone}` : ''} for an updated quote.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-800">Accept this proposal</p>
              {!sigEmpty && (
                <button
                  onClick={() => { sigRef.current?.clear(); setSigEmpty(true); }}
                  className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
            <div className="rounded-xl border bg-white overflow-hidden touch-none">
              <SignaturePad
                ref={sigRef}
                onEnd={() => setSigEmpty(sigRef.current?.isEmpty() ?? true)}
                canvasProps={{ className: 'w-full', height: 150, style: { touchAction: 'none' } }}
                backgroundColor="white"
                penColor="#1C2B1A"
              />
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your full name"
              className="h-10 text-sm"
              autoComplete="name"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              onClick={() => respond('accept')}
              disabled={busy !== null}
              className="w-full h-11 gap-2 text-white text-base font-semibold"
              style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            >
              {busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Accept &amp; Sign
            </Button>
            <p className="text-[11px] text-gray-400 text-center">
              By signing you agree to the services and pricing above.
            </p>

            {declineOpen ? (
              <div className="pt-2 border-t space-y-2">
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={2}
                  placeholder="Optional — tell us why (helps us improve)"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="outline"
                  onClick={() => respond('decline')}
                  disabled={busy !== null}
                  className="w-full gap-1.5 text-gray-600"
                >
                  {busy === 'decline' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Confirm Decline
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setDeclineOpen(true)}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-1"
              >
                No thanks — decline this proposal
              </button>
            )}
          </div>
        )}

        {/* Footer contact */}
        <p className="text-center text-xs text-gray-400 pb-6">
          Questions? {company?.phone && <>Call {company.phone}. </>}
          {company?.email && <>Email {company.email}.</>}
        </p>
      </div>
    </div>
  );
}
