'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { localDateStr } from '@/lib/dates';
import { buildCustomersCsv, buildInvoicesCsv, buildPaymentsCsv, type QboInvoice, type QboPayment, type QboClient } from '@/lib/qbo-export';

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Billing → QuickBooks export. Three CSVs in QBO's import layout for a
 * date range: customers touched in the range, invoices (one row per line
 * item), and payments. RLS scopes everything to the company.
 */
export function QuickBooksExport() {
  const supabase = createClient();
  const today = localDateStr();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  async function exportInvoices() {
    setBusy('invoices');
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, issued_date, due_date, tax_rate, notes, client:clients(name, company_name), invoice_line_items(description, quantity, unit_price, total, sort_order, service:services(name))')
        .gte('issued_date', from).lte('issued_date', to)
        .neq('status', 'cancelled')
        .order('issued_date')
        .limit(2000);
      if (error) throw error;
      const invoices: QboInvoice[] = (data ?? []).map((inv) => ({
        invoice_number: inv.invoice_number,
        issued_date: inv.issued_date,
        due_date: inv.due_date,
        tax_rate: Number(inv.tax_rate ?? 0),
        notes: inv.notes,
        client: (inv.client as unknown as QboClient | null),
        lines: ((inv.invoice_line_items ?? []) as unknown as Array<{ description: string; quantity: number; unit_price: number; total: number; sort_order: number; service: { name: string } | null }>)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), total: Number(l.total), service_name: l.service?.name ?? null })),
      }));
      if (!invoices.length) { toast.message('No invoices in that range.'); return; }
      download(`quickbooks-invoices-${from}-to-${to}.csv`, buildInvoicesCsv(invoices));
      toast.success(`${invoices.length} invoices exported.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportPayments() {
    setBusy('payments');
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('payment_date, amount, method, reference_number, invoice:invoices(invoice_number, client:clients(name, company_name))')
        .gte('payment_date', from).lte('payment_date', to)
        .order('payment_date')
        .limit(5000);
      if (error) throw error;
      const payments: QboPayment[] = (data ?? []).map((p) => {
        const inv = p.invoice as unknown as { invoice_number: string; client: QboClient | null } | null;
        return {
          payment_date: p.payment_date, amount: Number(p.amount), method: p.method, reference_number: p.reference_number,
          invoice_number: inv?.invoice_number ?? '', client_name: inv?.client?.company_name?.trim() || inv?.client?.name || '',
        };
      });
      if (!payments.length) { toast.message('No payments in that range.'); return; }
      download(`quickbooks-payments-${from}-to-${to}.csv`, buildPaymentsCsv(payments));
      toast.success(`${payments.length} payments exported.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportCustomers() {
    setBusy('customers');
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('name, company_name, email, phone, service_address, service_city, service_state, service_zip, billing_address')
        .in('status', ['active', 'inactive'])
        .order('name')
        .limit(5000);
      if (error) throw error;
      download(`quickbooks-customers-${today}.csv`, buildCustomersCsv((data ?? []) as QboClient[]));
      toast.success(`${data?.length ?? 0} customers exported.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">QuickBooks export</h3>
          <p className="text-xs text-muted-foreground">CSV files in QuickBooks Online&rsquo;s import layout. Import Customers first, then Invoices, then Payments.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label htmlFor="qbo-from" className="text-xs">From</Label><Input id="qbo-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="qbo-to" className="text-xs">To</Label><Input id="qbo-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { key: 'customers', label: 'Customers', run: exportCustomers },
          { key: 'invoices', label: 'Invoices', run: exportInvoices },
          { key: 'payments', label: 'Payments', run: exportPayments },
        ].map((b) => (
          <Button key={b.key} type="button" variant="outline" size="sm" onClick={b.run} disabled={busy !== null} className="gap-1.5">
            {busy === b.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {b.label} CSV
          </Button>
        ))}
      </div>
    </div>
  );
}
