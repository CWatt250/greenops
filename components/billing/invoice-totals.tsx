'use client';

interface Props {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoiceTotals({ subtotal, taxRate, taxAmount, total, amountPaid, balanceDue }: Props) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between py-1">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{fmt(subtotal)}</span>
      </div>
      {taxRate > 0 && (
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(1)}%)</span>
          <span>{fmt(taxAmount)}</span>
        </div>
      )}
      <div className="flex justify-between py-2 font-semibold border-t">
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
      {amountPaid > 0 && (
        <div className="flex justify-between py-1 text-green-600">
          <span>Paid</span>
          <span>-{fmt(amountPaid)}</span>
        </div>
      )}
      <div
        className="flex justify-between py-2 font-bold rounded-lg px-3 text-white"
        style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
      >
        <span>Balance Due</span>
        <span>{fmt(balanceDue)}</span>
      </div>
    </div>
  );
}
