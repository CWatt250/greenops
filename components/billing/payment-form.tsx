'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { Payment } from '@/types';

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  companyId: string;
  balanceDue: number;
  onPaymentAdded: (payment: Payment) => void;
}

export function PaymentForm({ open, onOpenChange, invoiceId, companyId, balanceDue, onPaymentAdded }: Props) {
  const supabase = createClient();
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [method, setMethod] = useState<'cash' | 'check' | 'card' | 'ach' | 'other'>('check');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a valid payment amount.');
      return;
    }

    setSaving(true);

    const { data: user } = await supabase.auth.getUser();

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        company_id: companyId,
        invoice_id: invoiceId,
        amount: parsed,
        method,
        reference_number: reference || null,
        payment_date: date,
        notes: notes || null,
        created_by: user.user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Touch invoice updated_at and refresh analytics views
    await supabase
      .from('invoices')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', invoiceId);
    void supabase.rpc('refresh_analytics');

    toast.success('Payment recorded.');
    onPaymentAdded(payment as Payment);
    onOpenChange(false);
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record Payment</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6 px-1">
          <div>
            <Label className="text-xs mb-1 block">Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-semibold"
              required
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="ach">ACH / Bank Transfer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Reference # (optional)</Label>
            <Input
              placeholder="Check number, transaction ID…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Notes (optional)</Label>
            <Input
              placeholder="Internal notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <SheetFooter className="pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="w-full gap-1.5"
              style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
