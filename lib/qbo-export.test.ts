import { describe, it, expect } from 'vitest';
import { buildCustomersCsv, buildInvoicesCsv, buildPaymentsCsv, csvCell, qboDate, customerName } from './qbo-export';

describe('qbo-export', () => {
  it('escapes commas, quotes, and newlines', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
  });
  it('formats dates the way QBO expects', () => {
    expect(qboDate('2026-09-05')).toBe('09/05/2026');
    expect(qboDate(null)).toBe('');
  });
  it('prefers company name for the customer', () => {
    expect(customerName({ name: 'Pat', company_name: 'Desert Hills HOA' })).toBe('Desert Hills HOA');
    expect(customerName({ name: 'Pat', company_name: '  ' })).toBe('Pat');
    expect(customerName(null)).toBe('Unknown customer');
  });
  it('emits one invoice row per line item with tax flags', () => {
    const csv = buildInvoicesCsv([{
      invoice_number: 'TLC-1001', issued_date: '2026-07-12', due_date: '2026-07-27', tax_rate: 0.087, notes: null,
      client: { name: 'James Whitmore' },
      lines: [
        { description: 'Mowing', quantity: 2, unit_price: 60, total: 120, service_name: 'Mowing' },
        { description: 'Edging, front', quantity: 1, unit_price: 140, total: 140 },
      ],
    }]);
    const rows = csv.trim().split('\r\n');
    expect(rows[0]).toBe('InvoiceNo,Customer,InvoiceDate,DueDate,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,Taxable,TaxRate,Memo');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe('TLC-1001,James Whitmore,07/12/2026,07/27/2026,Mowing,Mowing,2,60.00,120.00,Y,8.7,');
    expect(rows[2]).toContain('"Edging, front"');
    expect(rows[2]).toContain(',Services,');
  });
  it('emits a placeholder line for an invoice with no items', () => {
    const csv = buildInvoicesCsv([{ invoice_number: 'X', issued_date: '2026-01-01', tax_rate: 0, client: null, lines: [] }]);
    expect(csv.trim().split('\r\n')).toHaveLength(2);
    expect(csv).toContain('Unknown customer');
  });
  it('builds customers and payments sheets', () => {
    expect(buildCustomersCsv([{ name: 'A', service_address: '1 Main', service_city: 'Pasco', service_state: 'WA', service_zip: '99301' }])).toContain('A,,,,1 Main,Pasco,WA,99301,1 Main,Pasco,WA,99301');
    expect(buildPaymentsCsv([{ payment_date: '2026-08-01', amount: 50, method: 'check', reference_number: '1042', invoice_number: 'TLC-1', client_name: 'A' }])).toContain('08/01/2026,A,TLC-1,50.00,check,1042');
  });
});
