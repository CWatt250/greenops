'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { InvoicePreview } from '@/components/billing/invoice-preview';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Download, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, InvoiceLineItem, Client } from '@/types';

export default function PortalInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [invoice, setInvoice] = useState<(Invoice & { client: Client | null }) | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    const [invRes, liRes] = await Promise.all([
      supabase.from('invoices').select('*, client:clients(*)').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    ]);
    if (invRes.data) setInvoice(invRes.data as unknown as Invoice & { client: Client | null });
    setLineItems((liRes.data ?? []) as InvoiceLineItem[]);
    setLoading(false);
  }, [id]);

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
        <div className="flex gap-2">
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
          <Button
            size="sm"
            disabled
            className="gap-1.5 rounded-xl opacity-60 cursor-not-allowed"
            title="Online payments coming soon"
          >
            <CreditCard className="h-4 w-4" />
            Pay Now
          </Button>
        </div>
      </div>

      <InvoicePreview invoice={invoice} lineItems={lineItems} />
    </div>
  );
}
