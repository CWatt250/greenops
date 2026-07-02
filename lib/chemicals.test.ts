import { describe, it, expect } from 'vitest';
import {
  licenseHealth, isUsableLicense, computeReentryUntil, activeReentry, buildWsdaCsv,
} from './chemicals';
import type { ChemicalApplication } from '@/types';

const NOW = new Date('2026-07-02T12:00:00');

describe('licenseHealth', () => {
  it('flags no expiration date', () => {
    expect(licenseHealth({ expiration_date: null }, NOW)).toEqual({ status: 'no_expiry', daysLeft: null });
  });
  it('valid when > 30 days out', () => {
    expect(licenseHealth({ expiration_date: '2026-12-31' }, NOW).status).toBe('valid');
  });
  it('expiring at exactly 30 days', () => {
    const h = licenseHealth({ expiration_date: '2026-08-01' }, NOW);
    expect(h).toEqual({ status: 'expiring', daysLeft: 30 });
  });
  it('critical at 7 days', () => {
    expect(licenseHealth({ expiration_date: '2026-07-09' }, NOW).status).toBe('critical');
  });
  it('still usable on the expiration day itself', () => {
    const h = licenseHealth({ expiration_date: '2026-07-02' }, NOW);
    expect(h).toEqual({ status: 'critical', daysLeft: 0 });
    expect(isUsableLicense({ expiration_date: '2026-07-02' }, NOW)).toBe(true);
  });
  it('expired the day after', () => {
    expect(licenseHealth({ expiration_date: '2026-07-01' }, NOW).status).toBe('expired');
    expect(isUsableLicense({ expiration_date: '2026-07-01' }, NOW)).toBe(false);
  });
});

describe('computeReentryUntil', () => {
  it('adds the interval', () => {
    expect(computeReentryUntil('2026-07-02T10:00:00.000Z', 24))
      .toBe('2026-07-03T10:00:00.000Z');
  });
  it('null for zero/undefined interval', () => {
    expect(computeReentryUntil('2026-07-02T10:00:00.000Z', 0)).toBeNull();
    expect(computeReentryUntil('2026-07-02T10:00:00.000Z', undefined)).toBeNull();
  });
  it('null for bad date', () => {
    expect(computeReentryUntil('garbage', 24)).toBeNull();
  });
});

describe('activeReentry', () => {
  it('picks the furthest-out future window', () => {
    const r = activeReentry([
      { reentry_until: '2026-07-02T14:00:00Z', product_id: 'a', product: { name: 'A' } },
      { reentry_until: '2026-07-02T20:00:00Z', product_id: 'b', product: { name: 'B' } },
      { reentry_until: '2026-07-01T20:00:00Z', product_id: 'c', product: { name: 'C' } }, // past
    ], new Date('2026-07-02T12:00:00Z'));
    expect(r?.productName).toBe('B');
  });
  it('null when everything is past or missing', () => {
    expect(activeReentry([
      { reentry_until: '2026-07-01T00:00:00Z', product_id: 'a' },
      { reentry_until: null, product_id: 'b' },
    ], new Date('2026-07-02T12:00:00Z'))).toBeNull();
  });
});

describe('buildWsdaCsv', () => {
  const app = {
    id: '1', company_id: 'c', client_id: 'cl', product_id: 'p',
    applicator_id: 'u1', applied_at: '2026-07-02T17:30:00Z',
    amount_applied: 2.5, amount_unit: 'oz', created_at: '',
    target_pest: 'dandelion, clover', // comma forces quoting
    product: {
      id: 'p', company_id: 'c', name: 'SpeedZone "EW"', is_active: true, created_at: '',
      epa_registration_number: '2217-833',
    },
    applicator: { full_name: 'Pat Crew' },
    client: { name: 'Smith HOA' },
  } as unknown as ChemicalApplication;

  it('escapes commas and quotes, includes license number', () => {
    const csv = buildWsdaCsv([app], new Map([['u1', 'WA-12345']]));
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('EPA Reg #');
    expect(row).toContain('"dandelion, clover"');
    expect(row).toContain('"SpeedZone ""EW"""');
    expect(row).toContain('WA-12345');
    expect(row).toContain('2217-833');
  });
});
