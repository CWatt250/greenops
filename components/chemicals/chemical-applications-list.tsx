'use client';

import { useEffect, useState } from 'react';
import { Loader2, FlaskConical, AlertTriangle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface ChemAppRow {
  id: string;
  applied_at: string;
  amount_applied: number;
  amount_unit: string;
  area_treated_sqft: number | null;
  target_pest: string | null;
  reentry_until: string | null;
  notes: string | null;
  weather_temp_f: number | null;
  weather_wind_mph: number | null;
  weather_conditions: string | null;
  dilution_rate: string | null;
  total_solution_gallons: number | null;
  product: {
    name: string;
    epa_registration_number: string | null;
    active_ingredient: string | null;
  } | null;
  applicator: { full_name: string | null } | null;
  client: { name: string; service_address: string } | null;
}

interface Props {
  /** Filter by client_id when shown on a client detail page. */
  clientId?: string;
  /** Filter by job_id when shown on a job detail page. */
  jobId?: string;
  /** Show the export-PDF button (hide for inline embeds inside tabs). */
  showExport?: boolean;
}

export function ChemicalApplicationsList({ clientId, jobId, showExport = true }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<ChemAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    let query = supabase
      .from('chemical_applications')
      .select(`
        id, applied_at, amount_applied, amount_unit, area_treated_sqft,
        target_pest, reentry_until, notes,
        weather_temp_f, weather_wind_mph, weather_conditions,
        dilution_rate, total_solution_gallons,
        product:chemical_products(name, epa_registration_number, active_ingredient),
        applicator:profiles!chemical_applications_applicator_id_fkey(full_name),
        client:clients(name, service_address)
      `)
      .order('applied_at', { ascending: false });
    if (clientId) query = query.eq('client_id', clientId);
    if (jobId) query = query.eq('job_id', jobId);
    const { data } = await query;
    setRows((data ?? []) as unknown as ChemAppRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId, jobId]);

  async function exportPdf() {
    if (rows.length === 0) { toast.error('No applications to export.'); return; }
    setExporting(true);
    try {
      const [{ pdf }, { ChemicalApplicationsDocument }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/chemicals-pdf'),
        import('react'),
      ]);
      const doc = React.default.createElement(ChemicalApplicationsDocument, {
        rows,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `Chemical-Applications-${ts}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <FlaskConical className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-semibold">No chemical applications yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          When a crew logs an application from a job, it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showExport && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={exportPdf}
            disabled={exporting}
            className="gap-1.5"
          >
            {exporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            Export Records (WA State Format)
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const expired = !r.reentry_until || new Date(r.reentry_until).getTime() <= Date.now();
          return (
            <li key={r.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.product?.name ?? '—'}
                    {r.product?.epa_registration_number && (
                      <span className="text-[11px] text-muted-foreground font-mono ml-2">
                        EPA {r.product.epa_registration_number}
                      </span>
                    )}
                  </p>
                  {r.product?.active_ingredient && (
                    <p className="text-[11px] text-muted-foreground italic">
                      {r.product.active_ingredient}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {new Date(r.applied_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{r.amount_applied} {r.amount_unit}</span>
                {r.dilution_rate && <span>· {r.dilution_rate}</span>}
                {r.area_treated_sqft && <span>· {r.area_treated_sqft.toLocaleString()} sf</span>}
                {r.target_pest && <span>· {r.target_pest}</span>}
                {r.applicator?.full_name && <span>· by {r.applicator.full_name}</span>}
              </div>
              {(r.weather_temp_f != null || r.weather_wind_mph != null || r.weather_conditions) && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {r.weather_conditions ?? ''}
                  {r.weather_temp_f != null && ` ${r.weather_temp_f}°F`}
                  {r.weather_wind_mph != null && ` · ${r.weather_wind_mph} mph wind`}
                </p>
              )}
              {!expired && r.reentry_until && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  Re-entry until {new Date(r.reentry_until).toLocaleString()}
                </p>
              )}
              {r.notes && (
                <p className="text-[11px] text-muted-foreground italic mt-1">{r.notes}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
