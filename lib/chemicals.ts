import type { ApplicatorLicense, ChemicalApplication } from '@/types';

// ── Applicator license status ───────────────────────────────────────────────

export type LicenseStatus = 'valid' | 'expiring' | 'critical' | 'expired' | 'no_expiry';

export interface LicenseHealth {
  status: LicenseStatus;
  /** Whole days until expiration (negative = days since it lapsed). */
  daysLeft: number | null;
}

/**
 * 30-day warning, 7-day critical, hard expired — the thresholds the
 * dashboard badges and the application-logging gate both use.
 */
export function licenseHealth(
  license: Pick<ApplicatorLicense, 'expiration_date'>,
  now: Date = new Date(),
): LicenseHealth {
  if (!license.expiration_date) return { status: 'no_expiry', daysLeft: null };
  // Licenses expire at end-of-day local; anchor both sides to noon to dodge
  // the UTC date-drift class of bugs (see audit 2026-06-11).
  const exp = new Date(`${license.expiration_date}T12:00:00`);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 7) return { status: 'critical', daysLeft };
  if (daysLeft <= 30) return { status: 'expiring', daysLeft };
  return { status: 'valid', daysLeft };
}

/** A license an applicator may legally apply under right now. */
export function isUsableLicense(
  license: Pick<ApplicatorLicense, 'expiration_date'>,
  now: Date = new Date(),
): boolean {
  const { status } = licenseHealth(license, now);
  return status !== 'expired';
}

// ── Re-entry intervals ──────────────────────────────────────────────────────

export function computeReentryUntil(
  appliedAtIso: string,
  reentryHours: number | null | undefined,
): string | null {
  const hours = Number(reentryHours ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const applied = new Date(appliedAtIso);
  if (Number.isNaN(applied.getTime())) return null;
  return new Date(applied.getTime() + hours * 3_600_000).toISOString();
}

/** The furthest-out active re-entry window, or null when the site is clear. */
export function activeReentry(
  applications: Array<Pick<ChemicalApplication, 'reentry_until' | 'product_id'> & { product?: { name: string } | null }>,
  now: Date = new Date(),
): { until: Date; productName: string | null } | null {
  let latest: { until: Date; productName: string | null } | null = null;
  for (const app of applications) {
    if (!app.reentry_until) continue;
    const until = new Date(app.reentry_until);
    if (Number.isNaN(until.getTime()) || until <= now) continue;
    if (!latest || until > latest.until) {
      latest = { until, productName: app.product?.name ?? null };
    }
  }
  return latest;
}

// ── WSDA application-record export ──────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * WSDA pesticide application record (WAC 16-228-1320 record-keeping fields).
 * One row per application; columns ordered the way an inspector reads them.
 */
export function buildWsdaCsv(
  apps: ChemicalApplication[],
  licenseByProfile: Map<string, string>,
): string {
  const header = [
    'Application Date', 'Application Time', 'Applicator', 'License #',
    'Product', 'EPA Reg #', 'Active Ingredient',
    'Amount Applied', 'Unit', 'Dilution/Concentration', 'Total Solution (gal)',
    'Area Treated (sqft)', 'Target Pest', 'Site Address', 'Client',
    'Temp (F)', 'Wind (mph)', 'Conditions', 'Re-entry Until', 'Notes',
  ];
  const rows = apps.map((a) => {
    const applied = new Date(a.applied_at);
    return [
      applied.toLocaleDateString('en-US'),
      applied.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      a.applicator?.full_name ?? '',
      licenseByProfile.get(a.applicator_id) ?? '',
      a.product?.name ?? '',
      a.product?.epa_registration_number ?? '',
      a.product?.active_ingredient ?? '',
      a.amount_applied,
      a.amount_unit,
      a.dilution_rate ?? '',
      a.total_solution_gallons ?? '',
      a.area_treated_sqft ?? '',
      a.target_pest ?? '',
      a.site_address ?? '',
      a.client?.name ?? '',
      a.weather_temp_f ?? '',
      a.weather_wind_mph ?? '',
      a.weather_conditions ?? '',
      a.reentry_until ? new Date(a.reentry_until).toLocaleString('en-US') : '',
      a.notes ?? '',
    ].map(csvEscape).join(',');
  });
  return [header.map(csvEscape).join(','), ...rows].join('\r\n');
}

export const RATE_UNITS = [
  { value: 'oz_per_gal', label: 'oz / gal' },
  { value: 'oz_per_1000sqft', label: 'oz / 1,000 sqft' },
  { value: 'lb_per_1000sqft', label: 'lb / 1,000 sqft' },
  { value: 'gal_per_acre', label: 'gal / acre' },
  { value: 'percent', label: '% concentration' },
] as const;

export const AMOUNT_UNITS = ['oz', 'fl oz', 'lb', 'gal', 'g', 'mL', 'L'] as const;

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  herbicide: 'Herbicide',
  insecticide: 'Insecticide',
  fungicide: 'Fungicide',
  fertilizer: 'Fertilizer',
  growth_regulator: 'Growth Regulator',
  other: 'Other',
};
