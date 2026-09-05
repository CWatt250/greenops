/**
 * QuickBooks Online CSV exports. QBO's built-in importer accepts three
 * spreadsheets (Customers, Invoices, and a generic transactions sheet for
 * payments) with the column names below; we emit exactly those headers so
 * the bookkeeper maps nothing by hand. Pure functions — unit-tested.
 */
export interface QboClient {
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  billing_address?: string | null;
}

export interface QboInvoice {
  invoice_number: string;
  issued_date: string;
  due_date?: string | null;
  tax_rate: number;
  notes?: string | null;
  client: QboClient | null;
  lines: Array<{ description: string; quantity: number; unit_price: number; total: number; service_name?: string | null }>;
}

export interface QboPayment {
  payment_date: string;
  amount: number;
  method: string;
  reference_number?: string | null;
  invoice_number: string;
  client_name: string;
}

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** QBO date format is MM/DD/YYYY. */
export function qboDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
}

export function customerName(c: QboClient | null): string {
  return (c?.company_name?.trim() || c?.name?.trim() || 'Unknown customer');
}

export function buildCustomersCsv(clients: QboClient[]): string {
  const headers = ['Name', 'Company', 'Email', 'Phone', 'Billing Street', 'Billing City', 'Billing State', 'Billing ZIP', 'Shipping Street', 'Shipping City', 'Shipping State', 'Shipping ZIP'];
  const rows = clients.map((c) => [
    customerName(c), c.company_name ?? '', c.email ?? '', c.phone ?? '',
    c.billing_address ?? c.service_address ?? '', c.service_city ?? '', c.service_state ?? '', c.service_zip ?? '',
    c.service_address ?? '', c.service_city ?? '', c.service_state ?? '', c.service_zip ?? '',
  ]);
  return toCsv(headers, rows);
}

/** One row per line item; QBO groups rows by InvoiceNo. */
export function buildInvoicesCsv(invoices: QboInvoice[]): string {
  const headers = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'Taxable', 'TaxRate', 'Memo'];
  const rows: unknown[][] = [];
  for (const inv of invoices) {
    const lines = inv.lines.length ? inv.lines : [{ description: 'Services', quantity: 1, unit_price: 0, total: 0, service_name: null }];
    for (const l of lines) {
      rows.push([
        inv.invoice_number, customerName(inv.client), qboDate(inv.issued_date), qboDate(inv.due_date),
        l.service_name || 'Services', l.description, l.quantity, l.unit_price.toFixed(2), l.total.toFixed(2),
        inv.tax_rate > 0 ? 'Y' : 'N', inv.tax_rate > 0 ? (inv.tax_rate * 100).toFixed(3).replace(/\.?0+$/, '') : '', inv.notes ?? '',
      ]);
    }
  }
  return toCsv(headers, rows);
}

export function buildPaymentsCsv(payments: QboPayment[]): string {
  const headers = ['Date', 'Customer', 'InvoiceNo', 'Amount', 'PaymentMethod', 'ReferenceNo'];
  const rows = payments.map((p) => [qboDate(p.payment_date), p.client_name, p.invoice_number, p.amount.toFixed(2), p.method, p.reference_number ?? '']);
  return toCsv(headers, rows);
}
