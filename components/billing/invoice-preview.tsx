'use client';

import type { Invoice, InvoiceLineItem } from '@/types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface Props {
  invoice: Partial<Invoice> & {
    client?: { name: string; service_address?: string } | null;
  };
  lineItems: Array<{ description: string; quantity: number; unit_price: number; total?: number }>;
  companyName?: string;
}

export function InvoicePreview({ invoice, lineItems, companyName = 'TLC Landscape Management' }: Props) {
  const subtotal = lineItems.reduce((s, i) => s + (i.total ?? i.quantity * i.unit_price), 0);
  const taxRate = invoice.tax_rate ?? 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  return (
    <div className="bg-white rounded-xl border shadow-sm font-sans text-sm text-gray-800 overflow-auto" style={{ minHeight: 600 }}>
      <div className="p-8 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xl font-bold" style={{ color: '#3D6B2C' }}>{companyName}</p>
            <p className="text-xs text-gray-500 mt-1">Professional Landscape Services</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: '#3D6B2C' }}>INVOICE</p>
            {invoice.invoice_number && (
              <p className="text-xs text-gray-500 mt-1">#{invoice.invoice_number}</p>
            )}
            {invoice.issued_date && (
              <p className="text-xs text-gray-500">Issued: {invoice.issued_date}</p>
            )}
            {invoice.due_date && (
              <p className="text-xs text-gray-500">Due: {invoice.due_date}</p>
            )}
          </div>
        </div>

        {/* Bill to */}
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
            <p className="font-semibold">{invoice.client?.name ?? '—'}</p>
            {invoice.client?.service_address && (
              <p className="text-xs text-gray-500">{invoice.client.service_address}</p>
            )}
          </div>
          {invoice.status && (
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
              <p className="text-xs font-bold uppercase" style={{ color: '#3D6B2C' }}>{invoice.status}</p>
            </div>
          )}
        </div>

        {/* Line items */}
        <div>
          <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: '#3D6B2C' }}>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Total</span>
          </div>
          {lineItems.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">No line items yet</p>
          )}
          {lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-3 py-2 text-xs border-b last:border-0">
              <span>{item.description || <span className="text-gray-400">—</span>}</span>
              <span className="text-right">{item.quantity}</span>
              <span className="text-right">{fmt(item.unit_price)}</span>
              <span className="text-right font-medium">{fmt(item.total ?? item.quantity * item.unit_price)}</span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 px-3 rounded-lg font-bold text-white" style={{ backgroundColor: '#3D6B2C' }}>
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-xs text-gray-600">{invoice.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pt-4 border-t">
          Thank you for your business — {companyName}
        </p>
      </div>
    </div>
  );
}
