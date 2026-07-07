import { describe, it, expect } from 'vitest';
import { buildAging, buildAgingCsv, bucketFor, daysPastDue, type AgingInvoice } from './ar-aging';

const TODAY = '2026-07-07';

function inv(over: Partial<AgingInvoice>): AgingInvoice {
  return {
    id: 'x', invoice_number: 'INV-1', client_id: 'c1', clientName: 'Smith HOA',
    due_date: '2026-07-01', balance_due: 100, ...over,
  };
}

describe('bucketFor / daysPastDue', () => {
  it('boundaries land in the right buckets', () => {
    expect(bucketFor(0)).toBe('current');
    expect(bucketFor(-5)).toBe('current');
    expect(bucketFor(1)).toBe('1-30');
    expect(bucketFor(30)).toBe('1-30');
    expect(bucketFor(31)).toBe('31-60');
    expect(bucketFor(60)).toBe('31-60');
    expect(bucketFor(61)).toBe('61-90');
    expect(bucketFor(90)).toBe('61-90');
    expect(bucketFor(91)).toBe('90+');
  });
  it('no due date counts as due today (current)', () => {
    expect(daysPastDue(null, TODAY)).toBe(0);
  });
  it('exact day math across the month boundary', () => {
    expect(daysPastDue('2026-06-07', TODAY)).toBe(30);
    expect(daysPastDue('2026-06-06', TODAY)).toBe(31);
  });
});

describe('buildAging', () => {
  it('rolls up per client, sorts by total desc, ignores zero balances', () => {
    const aging = buildAging([
      inv({ id: 'a', balance_due: 100, due_date: '2026-07-01' }),           // 6d → 1-30
      inv({ id: 'b', balance_due: 250, due_date: '2026-03-01' }),           // >90
      inv({ id: 'c', client_id: 'c2', clientName: 'Jones', balance_due: 50, due_date: '2026-07-20' }), // current
      inv({ id: 'd', balance_due: 0 }),                                     // ignored
    ], TODAY);
    expect(aging.clients).toHaveLength(2);
    expect(aging.clients[0].clientName).toBe('Smith HOA'); // 350 > 50
    expect(aging.clients[0].buckets['1-30']).toBe(100);
    expect(aging.clients[0].buckets['90+']).toBe(250);
    expect(aging.totals.current).toBe(50);
    expect(aging.grandTotal).toBe(400);
    // worst invoices first inside a client
    expect(aging.clients[0].invoices[0].id).toBe('b');
  });
});

describe('buildAgingCsv', () => {
  it('has a client row and a totals row', () => {
    const aging = buildAging([inv({ clientName: 'A, B "C"' })], TODAY);
    const csv = buildAgingCsv(aging, TODAY);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('61-90 Days');
    expect(lines[1]).toContain('"A, B ""C"""');
    expect(lines.at(-1)).toContain('TOTAL');
  });
});
