'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { InvoiceForm } from '@/components/billing/invoice-form';
import { InvoicePreview } from '@/components/billing/invoice-preview';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { Invoice, JobLineItem, Client } from '@/types';

type PrefilledData = {
  clientId: string | null;
  client: Client | null;
  jobId: string | null;
  items: JobLineItem[];
};

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const jobIdParam = searchParams.get('job_id');

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<PrefilledData>({
    clientId: null,
    client: null,
    jobId: null,
    items: [],
  });
  const [previewData, setPreviewData] = useState<{
    invoice: Partial<Invoice> & { client?: Client | null };
    lineItems: Array<{ description: string; quantity: number; unit_price: number; total?: number }>;
  }>({ invoice: {}, lineItems: [] });
  const [loadingPrefill, setLoadingPrefill] = useState(!!jobIdParam);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      setCompanyId(profile?.company_id ?? null);
    });
  }, []);

  // Prefill from job
  useEffect(() => {
    if (!jobIdParam) return;
    async function prefillFromJob() {
      const { data: job } = await supabase
        .from('jobs')
        .select('*, client:clients(*), job_line_items(*)')
        .eq('id', jobIdParam!)
        .single();

      if (job) {
        setPrefilled({
          clientId: job.client_id ?? null,
          client: (job.client as Client) ?? null,
          jobId: job.id,
          items: (job.job_line_items ?? []) as unknown as JobLineItem[],
        });
        setPreviewData((prev) => ({
          ...prev,
          invoice: { ...prev.invoice, client: job.client as Client },
          lineItems: (job.job_line_items ?? []) as unknown as Array<{ description: string; quantity: number; unit_price: number; total?: number }>,
        }));
      }
      setLoadingPrefill(false);
    }
    prefillFromJob();
  }, [jobIdParam]);

  function handleSaved(invoice: Invoice) {
    router.push(`/dashboard/invoices/${invoice.id}`);
  }

  if (loadingPrefill || !companyId || !userId) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex overflow-hidden"
      style={{ height: 'calc(100svh - 3.5rem)' }}
    >
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[480px] shrink-0 flex flex-col border-r bg-background overflow-hidden">
        <div className="px-5 py-3 border-b shrink-0">
          <Link
            href="/dashboard/invoices"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Invoices
          </Link>
          <h1 className="text-sm font-bold">New Invoice</h1>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          <InvoiceForm
            companyId={companyId}
            userId={userId}
            prefillJobId={prefilled.jobId}
            prefillClientId={prefilled.clientId}
            prefillItems={prefilled.items}
            onSaved={handleSaved}
          />
        </div>
      </div>

      {/* ─── RIGHT PANEL — PREVIEW ─── */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        <p className="text-xs text-muted-foreground font-medium mb-3">Live Preview</p>
        <InvoicePreview
          invoice={{ ...previewData.invoice, client: prefilled.client ?? undefined }}
          lineItems={previewData.lineItems}
        />
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoiceContent />
    </Suspense>
  );
}
