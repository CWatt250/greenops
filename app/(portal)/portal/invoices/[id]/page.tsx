'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { InvoicePreview } from '@/components/billing/invoice-preview';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Download, Loader2, Phone, Mail, MailOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { Company, Invoice, InvoiceLineItem, Client } from '@/types';

export default function PortalInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [invoice, setInvoice] = useState<(Invoice & { client: Client | null }) | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    const [invRes, liRes] = await Promise.all([
      supabase.from('invoices').select('*, client:clients(*)').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    ]);
    if (invRes.data) {
      const inv = invRes.data as unknown as Invoice & { client: Client | null };
      setInvoice(inv);
      // Pull the company once so the Pay-Now fallback panel has phone/email/address.
      const { data: companyRow } = await supabase
        .from('companies').select('*').eq('id', inv.company_id).single();
      if (companyRow) setCompany(companyRow as Company);
    }
    setLineItems((liRes.data ?? []) as InvoiceLineItem[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  async function downloadPDF() {
    if (!invoice) return;
    setDownloading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { InvoiceDocument } = await import('@/lib/invoice-pdf');
      const { FALLBACK_COMPANY } = await import('@/lib/company-client');
      const React = (await import('react')).default;
      // Portal users can read their own company via the invoice's company_id.
      const { data: companyRow } = await supabase
        .from('companies')
        .select('*')
        .eq('id', invoice.company_id)
        .single();
      const company = companyRow ?? FALLBACK_COMPANY;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = React.createElement(InvoiceDocument as any, { invoice, lineItems, payments: [], company }) as any;
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
    setDownloading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!invoice) {
    return <p className="text-center py-16 text-sm text-gray-500">Invoice not found.</p>;
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadPDF}
          disabled={downloading}
          className="gap-1.5 rounded-xl"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          PDF
        </Button>
      </div>

      <InvoicePreview invoice={invoice} lineItems={lineItems} />

      {/* Pay-Now fallback panel — Stripe isn't wired yet, so give the customer
          something actionable instead of a dead button. */}
      {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
        <div
          className="rounded-2xl border bg-white p-4 shadow-sm"
          style={{ borderColor: 'var(--orange, #F15A24)' }}
        >
          <h2 className="text-sm font-semibold text-gray-900 mb-2">💳 How to Pay</h2>
          <p className="text-xs text-gray-600 mb-3">
            Online payments coming soon. For now, please pay by:
          </p>
          <div className="space-y-2 text-sm">
            {company?.phone && (
              <a
                href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                className="flex items-center gap-2 text-gray-700 hover:text-orange-600"
              >
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                {company.phone}
              </a>
            )}
            {company?.email && (
              <a
                href={`mailto:${company.email}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}`}
                className="flex items-center gap-2 text-gray-700 hover:text-orange-600 break-all"
              >
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                {company.email}
              </a>
            )}
            {(company?.address || company?.city) && (
              <div className="flex items-start gap-2 text-gray-700">
                <MailOpen className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold">{company?.name ?? 'Mail check to:'}</p>
                  {company?.address && <p>{company.address}</p>}
                  {(company?.city || company?.state || company?.zip) && (
                    <p>
                      {[company?.city, company?.state].filter(Boolean).join(', ')}
                      {company?.zip ? ` ${company.zip}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t">
            Reference invoice <strong className="text-gray-700">{invoice.invoice_number}</strong> with your payment.
          </p>
        </div>
      )}
    </div>
  );
}
