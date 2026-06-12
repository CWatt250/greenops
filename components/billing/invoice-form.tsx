'use client';

import { useState, useEffect } from 'react';
import { localDateStr } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LineItemsTable, type LineItemDraft } from '@/components/jobs/line-items-table';
import { Loader2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Invoice, InvoiceLineItem, JobLineItem } from '@/types';

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface Props {
  companyId: string;
  userId: string;
  prefillJobId?: string | null;
  prefillClientId?: string | null;
  prefillItems?: JobLineItem[];
  onSaved: (invoice: Invoice) => void;
}

export function InvoiceForm({ companyId, userId, prefillJobId, prefillClientId, prefillItems, onSaved }: Props) {
  const supabase = createClient();

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(prefillClientId ?? '');
  const [issuedDate, setIssuedDate] = useState(localDateStr(new Date()));
  const [dueDate, setDueDate] = useState(localDateStr(addDays(new Date(), 30)));
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('*').eq('company_id', companyId).eq('status', 'active').order('name')
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, [companyId]);

  const subtotal = lineItems.reduce((s, i) => s + (i.total ?? i.quantity * i.unit_price), 0);
  const parsedTaxRate = parseFloat(taxRate) / 100 || 0;
  const taxAmount = subtotal * parsedTaxRate;
  const total = subtotal + taxAmount;

  async function save(send: boolean): Promise<Invoice | null> {
    if (!clientId) { toast.error('Select a client.'); return null; }
    if (lineItems.length === 0) { toast.error('Add at least one line item.'); return null; }

    // Get next invoice number
    const { data: invNumData } = await supabase.rpc('next_invoice_number', { p_company_id: companyId });
    const invoiceNumber = (invNumData as string) ?? `INV-${Date.now()}`;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        company_id: companyId,
        client_id: clientId,
        job_id: prefillJobId ?? null,
        invoice_number: invoiceNumber,
        status: send ? 'sent' : 'draft',
        issued_date: issuedDate,
        due_date: dueDate || null,
        subtotal,
        tax_rate: parsedTaxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        balance_due: total,
        notes: notes || null,
        internal_notes: internalNotes || null,
        sent_at: send ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select('*, client:clients(*)')
      .single();

    if (error || !invoice) {
      toast.error(error?.message ?? 'Failed to create invoice.');
      return null;
    }

    // Insert line items
    const itemInserts = lineItems.map((item, idx) => ({
      invoice_id: invoice.id,
      service_id: item.service_id && item.service_id !== '__custom__' ? item.service_id : null,
      description: item.description || 'Service',
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }));

    const { error: liErr } = await supabase.from('invoice_line_items').insert(itemInserts);
    if (liErr) {
      toast.error(liErr.message);
      return null;
    }

    return invoice as unknown as Invoice;
  }

  async function handleSave() {
    setSaving(true);
    const inv = await save(false);
    setSaving(false);
    if (inv) { toast.success('Invoice saved as draft.'); onSaved(inv); }
  }

  async function handleSend() {
    setDispatching(true);
    const inv = await save(true);
    setDispatching(false);
    if (inv) { toast.success('Invoice marked as sent.'); onSaved(inv); }
  }

  return (
    <div className="space-y-5">
      {/* Client + Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs mb-1 block">Client</Label>
          <Select value={clientId} onValueChange={(v) => setClientId(v ?? '')}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Issued Date</Label>
          <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
        </div>
      </div>

      {/* Line items */}
      <div>
        <Label className="text-xs mb-2 block">Line Items</Label>
        <LineItemsTable onChange={setLineItems} initialItems={prefillItems} />
      </div>

      {/* Tax rate */}
      <div className="flex items-center gap-3">
        <div className="w-32">
          <Label className="text-xs mb-1 block">Tax Rate (%)</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="h-9"
          />
        </div>
        {parsedTaxRate > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            Tax: ${taxAmount.toFixed(2)} → Total: ${total.toFixed(2)}
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs mb-1 block">Client Notes (visible on invoice)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Payment terms, thank-you message…"
          className="text-sm resize-none"
        />
      </div>
      <div>
        <Label className="text-xs mb-1 block">Internal Notes</Label>
        <Textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          placeholder="Not visible to client"
          className="text-sm resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={saving || dispatching}
          className="flex-1 gap-1.5"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Draft
        </Button>
        <Button
          onClick={handleSend}
          disabled={saving || dispatching}
          className="flex-1 gap-1.5"
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Save & Send
        </Button>
      </div>
    </div>
  );
}
