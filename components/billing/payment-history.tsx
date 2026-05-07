'use client';

import type { Payment } from '@/types';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', check: 'Check', card: 'Card', ach: 'ACH', other: 'Other',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface Props {
  payments: Payment[];
}

export function PaymentHistory({ payments }: Props) {
  if (payments.length === 0) {
    return <p className="text-xs text-muted-foreground">No payments recorded.</p>;
  }

  return (
    <div className="space-y-1">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
          <div>
            <span className="font-medium">{fmt(p.amount)}</span>
            <span className="text-muted-foreground ml-2">via {METHOD_LABEL[p.method]}</span>
            {p.reference_number && (
              <span className="text-muted-foreground ml-1">#{p.reference_number}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{p.payment_date}</span>
        </div>
      ))}
    </div>
  );
}
