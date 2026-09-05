'use client';

import { useState, useEffect, useCallback } from 'react';
import { localDateStr } from '@/lib/dates';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { InvoicePreview } from '@/components/billing/invoice-preview';
import { InvoiceTotals } from '@/components/billing/invoice-totals';
import { PaymentForm } from '@/components/billing/payment-form';
import { PaymentHistory } from '@/components/billing/payment-history';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import {
  ChevronLeft, Loader2, Download, Copy, XCircle, CreditCard, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, InvoiceLineItem, Payment, Client } from '@/types';

type InvoiceWithClient = Invoice & { client: Client | null };

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [invoice, setInvoice] = useState<InvoiceWithClient | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [invRes, liRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*, client:clients(*)').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date'),
    ]);

    if (invRes.data) {
      // Check overdue
      const inv = invRes.data as unknown as InvoiceWithClient;
      const now = localDateStr();
      if (inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date && inv.due_date < now) {
        inv.status = 'overdue';
      }
      setInvoice(inv);
    }
    setLineItems((liRes.data ?? []) as InvoiceLineItem[]);
    setPayments((payRes.data ?? []) as Payment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: p } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      setCompanyId(p?.company_id ?? null);
    });
  }, []);

  async function markSent() {
    setActioning('send');
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Invoice marked as sent.'); await loadAll(); }
    setActioning(null);
  }

  /**
   * Send the invoice. The server route emails the customer a branded message
   * with a portal link and marks the invoice sent; if no email provider is
   * configured (or the client has no email) we fall back to the user's mail
   * client with a prefilled message so the invoice still goes out.
   */
  async function emailInvoice() {
    if (!invoice) return;
    setActioning('email');
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not send the invoice.');
        return;
      }
      if (json.emailed) {
        toast.success(`Invoice emailed to ${invoice.client?.email}.`);
      } else if (json.reason === 'no-email') {
        toast.error('No email on file for this client — marked as sent; deliver it another way.');
      } else {
        // No provider: open the mail client with the message prefilled.
        const { data: companyRow } = await supabase
          .from('companies')
          .select('name, phone, email')
          .eq('id', invoice.company_id)
          .single();
        const company = companyRow as { name?: string; phone?: string | null; email?: string | null } | null;
        const companyName = company?.name ?? 'Our team';
        const lines = [
          `Hi ${invoice.client?.name?.split(' ')[0] ?? 'there'},`,
          '',
          `Your invoice ${invoice.invoice_number} is ready — ${formatCurrency(invoice.balance_due)} due${invoice.due_date ? ` by ${invoice.due_date}` : ''}.`,
          '',
          `View it in your portal: ${json.portalUrl ?? `${window.location.origin}/portal/invoices/${invoice.id}`}`,
          '',
          'Thanks,',
          companyName,
          ...(company?.phone ? [company.phone] : []),
          ...(company?.email ? [company.email] : []),
        ];
        const subject = `Invoice ${invoice.invoice_number} from ${companyName}`;
        if (invoice.client?.email) {
          window.location.href = `mailto:${encodeURIComponent(invoice.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
        }
        toast.message('Marked as sent. Email delivery isn’t configured yet, so your mail app opened with the message.');
      }
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message ?? 'Network error');
    } finally {
      setActioning(null);
    }
  }

  async function cancelInvoice() {
    if (!confirm('Cancel this invoice?')) return;
    setActioning('cancel');
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Invoice cancelled.'); await loadAll(); }
    setActioning(null);
  }

  async function duplicateInvoice() {
    if (!invoice || !companyId) return;
    setActioning('dup');
    const { data: invNumData } = await supabase.rpc('next_invoice_number', { p_company_id: companyId });
    const { data: newInv, error } = await supabase
      .from('invoices')
      .insert({
        company_id: invoice.company_id,
        client_id: invoice.client_id,
        job_id: invoice.job_id,
        invoice_number: (invNumData as string) ?? `INV-DUP`,
        status: 'draft',
        issued_date: localDateStr(),
        due_date: invoice.due_date,
        subtotal: invoice.subtotal,
        tax_rate: invoice.tax_rate,
        tax_amount: invoice.tax_amount,
        total: invoice.total,
        amount_paid: 0,
        balance_due: invoice.total,
        notes: invoice.notes,
        internal_notes: invoice.internal_notes,
      })
      .select('id')
      .single();

    if (error || !newInv) { toast.error('Failed to duplicate.'); setActioning(null); return; }

    // Copy line items
    await supabase.from('invoice_line_items').insert(
      lineItems.map((li, i) => ({
        invoice_id: newInv.id,
        service_id: li.service_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: i,
      }))
    );

    toast.success('Invoice duplicated.');
    router.push(`/dashboard/invoices/${newInv.id}`);
    setActioning(null);
  }

  async function downloadPDF() {
    if (!invoice) return;
    setActioning('pdf');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { InvoiceDocument } = await import('@/lib/invoice-pdf');
      const { fetchOwnCompany, FALLBACK_COMPANY } = await import('@/lib/company-client');
      const React = (await import('react')).default;
      const company = (await fetchOwnCompany()) ?? FALLBACK_COMPANY;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = React.createElement(InvoiceDocument as any, { invoice, lineItems, payments, company }) as any;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF generation failed.');
    }
    setActioning(null);
  }

  function handlePaymentAdded(payment: Payment) {
    setPayments((prev) => [...prev, payment]);
    loadAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return <p className="text-sm text-muted-foreground text-center py-16">Invoice not found.</p>;
  }

  const canSend = invoice.status === 'draft';
  const canPay = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.balance_due > 0;
  const canCancel = invoice.status !== 'cancelled' && invoice.status !== 'paid';

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[360px] shrink-0 flex flex-col border-r bg-background overflow-hidden">

        <div className="px-4 py-3 border-b shrink-0">
          <Link
            href="/dashboard/invoices"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Invoices
          </Link>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-bold">{invoice.invoice_number}</h1>
              <p className="text-xs text-muted-foreground">{invoice.client?.name}</p>
            </div>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              STATUS_COLORS[invoice.status]
            )}>
              {invoice.status}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-5">
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Issued</p>
              <p className="font-medium">{invoice.issued_date}</p>
            </div>
            {invoice.due_date && (
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <p className={cn('font-medium', invoice.status === 'overdue' && 'text-red-600')}>
                  {invoice.due_date}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canSend && (
              <>
                <Button
                  size="sm"
                  onClick={emailInvoice}
                  disabled={actioning !== null}
                  className="gap-1.5"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                >
                  {actioning === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Invoice
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markSent}
                  disabled={actioning !== null}
                  className="gap-1.5"
                >
                  {actioning === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Mark Sent
                </Button>
              </>
            )}
            {canPay && (
              <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)} className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Record Payment
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={downloadPDF}
              disabled={actioning !== null}
              className="gap-1.5"
            >
              {actioning === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={duplicateInvoice}
              disabled={actioning !== null}
              className="gap-1.5"
            >
              {actioning === 'dup' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Duplicate
            </Button>
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelInvoice}
                disabled={actioning !== null}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>

          {/* Totals */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Summary</p>
            <InvoiceTotals
              subtotal={invoice.subtotal}
              taxRate={invoice.tax_rate}
              taxAmount={invoice.tax_amount}
              total={invoice.total}
              amountPaid={invoice.amount_paid}
              balanceDue={invoice.balance_due}
            />
          </div>

          {/* Payment history */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payments</p>
            <PaymentHistory payments={payments} />
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm">{invoice.notes}</p>
            </div>
          )}
          {invoice.internal_notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Internal Notes</p>
              <p className="text-sm text-muted-foreground">{invoice.internal_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT PANEL — PREVIEW ─── */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        <InvoicePreview
          invoice={invoice}
          lineItems={lineItems}
        />
      </div>

      {/* Payment sheet */}
      {companyId && (
        <PaymentForm
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          invoiceId={id}
          companyId={companyId}
          balanceDue={invoice.balance_due}
          onPaymentAdded={handlePaymentAdded}
        />
      )}
    </div>
  );
}
