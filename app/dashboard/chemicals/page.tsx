'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductForm } from '@/components/chemicals/product-form';
import { LicenseForm } from '@/components/chemicals/license-form';
import { ApplicationForm } from '@/components/chemicals/application-form';
import {
  FlaskConical, Plus, Pencil, IdCard, Download, Loader2, ExternalLink, SprayCan,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildWsdaCsv, licenseHealth, PRODUCT_TYPE_LABELS } from '@/lib/chemicals';
import { localDateStr } from '@/lib/dates';
import type { ApplicatorLicense, ChemicalApplication, ChemicalProduct } from '@/types';

export default function ChemicalsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [products, setProducts] = useState<ChemicalProduct[]>([]);
  const [licenses, setLicenses] = useState<ApplicatorLicense[]>([]);
  const [applications, setApplications] = useState<ChemicalApplication[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  // Sheets
  const [productOpen, setProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ChemicalProduct | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [editLicense, setEditLicense] = useState<ApplicatorLicense | null>(null);
  const [appOpen, setAppOpen] = useState(false);

  // Export range — default: year to date.
  const [fromDate, setFromDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(() => localDateStr());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (cid: string) => {
    const [prodRes, licRes, appRes, memRes] = await Promise.all([
      supabase.from('chemical_products').select('*').eq('company_id', cid).order('name'),
      supabase.from('applicator_licenses')
        .select('*, profile:profiles(full_name)').order('expiration_date'),
      supabase.from('chemical_applications')
        .select('*, product:chemical_products(*), applicator:profiles(full_name), client:clients(name)')
        .eq('company_id', cid)
        .order('applied_at', { ascending: false })
        .limit(50),
      supabase.from('profiles').select('id, full_name').eq('company_id', cid).order('full_name'),
    ]);
    setProducts((prodRes.data ?? []) as ChemicalProduct[]);
    setLicenses((licRes.data ?? []) as ApplicatorLicense[]);
    setApplications((appRes.data ?? []) as unknown as ChemicalApplication[]);
    setMembers((memRes.data ?? []) as Array<{ id: string; full_name: string | null }>);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const ctx = await getCompanyContext(supabase);
      if (!ctx) return;
      setUserId(ctx.userId);
      setCompanyId(ctx.companyId);
      await load(ctx.companyId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => { if (companyId) load(companyId); }, [companyId, load]);

  const licenseWarnings = useMemo(
    () => licenses.filter((l) => {
      const s = licenseHealth(l).status;
      return s === 'expiring' || s === 'critical' || s === 'expired';
    }),
    [licenses],
  );

  async function exportCsv() {
    if (!companyId) return;
    setExporting(true);
    const { data, error } = await supabase
      .from('chemical_applications')
      .select('*, product:chemical_products(*), applicator:profiles(full_name), client:clients(name)')
      .eq('company_id', companyId)
      .gte('applied_at', `${fromDate}T00:00:00`)
      .lte('applied_at', `${toDate}T23:59:59`)
      .order('applied_at');
    setExporting(false);
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as ChemicalApplication[];
    if (rows.length === 0) { toast.message('No applications in that date range.'); return; }
    const licenseByProfile = new Map(licenses.map((l) => [l.profile_id, l.license_number]));
    const csv = buildWsdaCsv(rows, licenseByProfile);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chemical-applications-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} application${rows.length === 1 ? '' : 's'}.`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Chemicals" description="Products, applicator licenses, and application records">
        <Button
          onClick={() => setAppOpen(true)}
          className="gap-1.5 text-white"
          style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
        >
          <SprayCan className="h-4 w-4" /> Log Application
        </Button>
      </PageHeader>

      <PageIntro
        id="chemicals"
        title="Stay WSDA-inspection ready"
        description="Every pesticide/fertilizer application is recorded with product, rate, weather, and re-entry interval — the records Washington requires you to keep."
        steps={[
          'Add products from the label: EPA reg #, active ingredient, re-entry hours.',
          'Keep applicator licenses current — expired licenses block logging.',
          'Export the WSDA report for any date range when an inspector asks.',
        ]}
      />

      {licenseWarnings.length > 0 && (
        <div className="mb-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-amber-800">License attention needed</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
            {licenseWarnings.map((l) => {
              const h = licenseHealth(l);
              return (
                <li key={l.id}>
                  • {l.profile?.full_name ?? 'Unnamed'} — {l.license_number}{' '}
                  {h.status === 'expired'
                    ? <span className="font-semibold text-red-600">expired {Math.abs(h.daysLeft ?? 0)}d ago</span>
                    : <>expires in <span className="font-semibold">{h.daysLeft}d</span></>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="licenses">Licenses ({licenses.length})</TabsTrigger>
        </TabsList>

        {/* ── Applications ── */}
        <TabsContent value="applications" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
            <div className="space-y-1">
              <Label htmlFor="exp-from" className="text-xs">From</Label>
              <Input id="exp-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-to" className="text-xs">To</Label>
              <Input id="exp-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={exporting} className="gap-1.5">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export WSDA CSV
            </Button>
          </div>

          {applications.length === 0 ? (
            <EmptyState
              icon={SprayCan}
              title="No applications logged"
              description="Crews log applications from the job page; the office can log one with the button above."
            />
          ) : (
            <ul className="space-y-2">
              {applications.map((a) => (
                <li key={a.id} className="rounded-xl border bg-card p-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold">
                        {a.product?.name ?? 'Product'}{' '}
                        <span className="font-normal text-muted-foreground">→ {a.client?.name ?? '—'}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.applied_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                        {' · '}{a.amount_applied} {a.amount_unit}
                        {a.area_treated_sqft ? ` · ${Number(a.area_treated_sqft).toLocaleString()} sqft` : ''}
                        {a.target_pest ? ` · ${a.target_pest}` : ''}
                        {' · by '}{a.applicator?.full_name ?? '—'}
                      </p>
                      {(a.weather_temp_f !== null || a.weather_conditions) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.weather_temp_f !== null ? `${a.weather_temp_f}°F` : ''}
                          {a.weather_wind_mph !== null ? ` · wind ${a.weather_wind_mph} mph` : ''}
                          {a.weather_conditions ? ` · ${a.weather_conditions}` : ''}
                        </p>
                      )}
                    </div>
                    {a.reentry_until && (
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0',
                        new Date(a.reentry_until) > new Date()
                          ? 'bg-red-100 text-red-700'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {new Date(a.reentry_until) > new Date() ? 'REI until ' : 'REI ended '}
                        {new Date(a.reentry_until).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ── Products ── */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => { setEditProduct(null); setProductOpen(true); }}
              className="gap-1.5 text-white"
              style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            >
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No products yet"
              description="Add the chemicals you apply — name, EPA reg #, and re-entry interval from the label."
            />
          ) : (
            <ul className="space-y-2">
              {products.map((p) => (
                <li key={p.id} className={cn('rounded-xl border bg-card p-3.5', !p.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {p.name}
                        {!p.is_active && <span className="ml-2 text-[11px] font-medium text-muted-foreground">(inactive)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[
                          p.product_type ? PRODUCT_TYPE_LABELS[p.product_type] : null,
                          p.epa_registration_number ? `EPA ${p.epa_registration_number}` : null,
                          p.active_ingredient,
                          p.reentry_interval_hours ? `REI ${p.reentry_interval_hours}h` : 'no REI',
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.sds_url && (
                        <a
                          href={p.sds_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-muted-foreground hover:text-foreground" title="SDS"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => { setEditProduct(p); setProductOpen(true); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground" title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ── Licenses ── */}
        <TabsContent value="licenses" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => { setEditLicense(null); setLicenseOpen(true); }}
              className="gap-1.5 text-white"
              style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            >
              <Plus className="h-4 w-4" /> Add License
            </Button>
          </div>
          {licenses.length === 0 ? (
            <EmptyState
              icon={IdCard}
              title="No applicator licenses"
              description="Add each licensed applicator's WSDA license so applications can be logged against it."
            />
          ) : (
            <ul className="space-y-2">
              {licenses.map((l) => {
                const h = licenseHealth(l);
                return (
                  <li key={l.id} className="rounded-xl border bg-card p-3.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{l.profile?.full_name ?? 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {l.license_number}
                        {l.license_type ? ` · ${l.license_type}` : ''}
                        {l.state ? ` · ${l.state}` : ''}
                        {l.expiration_date ? ` · expires ${new Date(`${l.expiration_date}T12:00`).toLocaleDateString('en-US')}` : ' · no expiration on file'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        h.status === 'valid' && 'bg-green-100 text-green-700',
                        h.status === 'expiring' && 'bg-amber-100 text-amber-700',
                        h.status === 'critical' && 'bg-orange-100 text-orange-700',
                        h.status === 'expired' && 'bg-red-100 text-red-700',
                        h.status === 'no_expiry' && 'bg-muted text-muted-foreground',
                      )}>
                        {h.status === 'valid' && 'Current'}
                        {h.status === 'expiring' && `${h.daysLeft}d left`}
                        {h.status === 'critical' && `${h.daysLeft}d left!`}
                        {h.status === 'expired' && 'Expired'}
                        {h.status === 'no_expiry' && 'No expiry set'}
                      </span>
                      <button
                        onClick={() => { setEditLicense(l); setLicenseOpen(true); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground" title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {companyId && (
        <>
          <ProductForm
            open={productOpen} onOpenChange={setProductOpen}
            companyId={companyId} product={editProduct} onSaved={refresh}
          />
          <LicenseForm
            open={licenseOpen} onOpenChange={setLicenseOpen}
            members={members} license={editLicense} onSaved={refresh}
          />
          {userId && (
            <ApplicationForm
              open={appOpen} onOpenChange={setAppOpen}
              companyId={companyId} userId={userId} onSaved={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}
