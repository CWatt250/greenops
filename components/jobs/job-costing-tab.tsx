'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader2, Plus, Save, Trash2, Wrench, Package, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  actualLaborFromClock, applyOverhead, fmtHours, fmtUsd, pairClockEvents,
  profitSummary, sumCostEntries, varianceTone,
  type ClockEvent, type CrewMemberRate,
} from '@/lib/job-costing';
import type { JobCostCategory, JobCostEntry } from '@/types';

interface Props {
  jobId: string;
  companyId: string;
  userId: string;
  /** Estimated values currently stored on the job row. */
  initialEstimated: {
    labor_hours: number;
    labor_cost: number;
    materials_cost: number;
    equipment_cost: number;
  };
  /** Revenue from the linked invoice (if any) — pre-resolved by the parent. */
  initialRevenue: number;
  /** Company-wide overhead percentage. */
  overheadPct: number;
  /** Company default labor rate (migration 048) — fallback for a clocked-in
   *  profile with no crew_members rate. null when unset / not yet migrated, in
   *  which case unrated labor is flagged rather than priced at a fake rate. */
  companyDefaultRate?: number | null;
}

const TONE_BG = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};

export function JobCostingTab({
  jobId, companyId, userId, initialEstimated, initialRevenue, overheadPct,
  companyDefaultRate = null,
}: Props) {
  const supabase = createClient();

  // Estimated values — editable.
  const [estLaborHours, setEstLaborHours] = useState(initialEstimated.labor_hours);
  const [estLaborCost, setEstLaborCost] = useState(initialEstimated.labor_cost);
  const [estMaterialsCost, setEstMaterialsCost] = useState(initialEstimated.materials_cost);
  const [estEquipmentCost, setEstEquipmentCost] = useState(initialEstimated.equipment_cost);
  const [revenue, setRevenue] = useState(initialRevenue);

  // Live actuals — computed from clock_events + cost entries.
  const [costEntries, setCostEntries] = useState<JobCostEntry[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [crewRates, setCrewRates] = useState<CrewMemberRate[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-entry form
  const [entryCategory, setEntryCategory] = useState<JobCostCategory>('material');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryQty, setEntryQty] = useState<number>(1);
  const [entryUnitCost, setEntryUnitCost] = useState<number>(0);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<JobCostEntry | null>(null);
  const [savingEstimates, setSavingEstimates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [entriesRes, clockRes] = await Promise.all([
        supabase
          .from('job_cost_entries')
          .select('*')
          .eq('job_id', jobId)
          .order('added_at', { ascending: true }),
        supabase
          .from('clock_events')
          .select('profile_id, event_type, created_at')
          .eq('job_id', jobId)
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      const entries = (entriesRes.data ?? []) as JobCostEntry[];
      const events = (clockRes.data ?? []) as ClockEvent[];
      setCostEntries(entries);
      setClockEvents(events);

      // Pull rates for any profile that clocked in. Keep raw values — a
      // missing row or null rate is exactly what flags "rate not set"; the
      // lib decides the fallback. Pre-coalescing to 25 here would fabricate
      // a rate and hide the gap.
      const profileIds = Array.from(new Set(events.map((e) => e.profile_id)));
      if (profileIds.length > 0) {
        const { data: rateRows } = await supabase
          .from('crew_members')
          .select('profile_id, hourly_rate, labor_burden_pct')
          .in('profile_id', profileIds);
        if (!cancelled) {
          // crew_members can list a profile multiple times if on multiple
          // crews — keep the first match.
          const seen = new Map<string, CrewMemberRate>();
          for (const r of (rateRows ?? []) as Array<{
            profile_id: string;
            hourly_rate: number | null;
            labor_burden_pct: number | null;
          }>) {
            if (!seen.has(r.profile_id)) seen.set(r.profile_id, {
              profile_id: r.profile_id,
              hourly_rate: r.hourly_rate == null ? null : Number(r.hourly_rate),
              labor_burden_pct: r.labor_burden_pct == null ? null : Number(r.labor_burden_pct),
            });
          }
          setCrewRates(Array.from(seen.values()));
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Computed ──
  const intervals = useMemo(() => pairClockEvents(clockEvents), [clockEvents]);
  const actualLabor = useMemo(
    () => actualLaborFromClock(intervals, crewRates, { companyDefaultRate }),
    [intervals, crewRates, companyDefaultRate]
  );
  const ratesComplete = actualLabor.unratedProfileIds.length === 0;
  const entrySums = useMemo(() => sumCostEntries(costEntries), [costEntries]);
  const actualMaterials = entrySums.material;
  const actualEquipment = entrySums.equipment;
  const actualOther = entrySums.other;

  const estimatedTotals = useMemo(() => {
    return applyOverhead(estLaborCost, estMaterialsCost, estEquipmentCost, overheadPct);
  }, [estLaborCost, estMaterialsCost, estEquipmentCost, overheadPct]);

  const actualTotals = useMemo(() => {
    return applyOverhead(actualLabor.cost, actualMaterials, actualEquipment + actualOther, overheadPct);
  }, [actualLabor.cost, actualMaterials, actualEquipment, actualOther, overheadPct]);

  // "Has cost data" = any tracked labor hours OR any logged cost entry. A job
  // with neither has UNKNOWN cost, not zero cost — so we show "—", never a
  // fabricated 100% margin.
  const hasCostData = actualLabor.hours > 0 || costEntries.length > 0;
  const profit = useMemo(
    () => profitSummary(revenue, actualTotals.total, { ratesComplete, hasCostData }),
    [revenue, actualTotals.total, ratesComplete, hasCostData]
  );

  // ── Handlers ──
  async function addEntry() {
    if (!entryDesc.trim()) {
      toast.error('Description required.');
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from('job_cost_entries')
      .insert({
        company_id: companyId,
        job_id: jobId,
        category: entryCategory,
        description: entryDesc.trim(),
        quantity: entryQty,
        unit_cost: entryUnitCost,
        added_by: userId,
      })
      .select('*')
      .single();
    setAdding(false);
    if (error || !data) {
      toast.error(error?.message ?? 'Failed to add entry.');
      return;
    }
    setCostEntries((prev) => [...prev, data as JobCostEntry]);
    setEntryDesc('');
    setEntryQty(1);
    setEntryUnitCost(0);
    toast.success('Cost entry added.');
  }

  async function removeEntry(entry: JobCostEntry) {
    const { error } = await supabase
      .from('job_cost_entries')
      .delete()
      .eq('id', entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCostEntries((prev) => prev.filter((e) => e.id !== entry.id));
    toast.success('Entry removed.');
  }

  async function saveSnapshot() {
    setSavingEstimates(true);
    const { error } = await supabase
      .from('jobs')
      .update({
        estimated_labor_hours: estLaborHours,
        estimated_labor_cost: estLaborCost,
        estimated_materials_cost: estMaterialsCost,
        estimated_equipment_cost: estEquipmentCost,
        estimated_overhead_cost: estimatedTotals.overhead,
        estimated_total_cost: estimatedTotals.total,
        actual_labor_hours: actualLabor.hours,
        actual_labor_cost: actualLabor.cost,
        actual_materials_cost: actualMaterials,
        actual_equipment_cost: actualEquipment,
        actual_overhead_cost: actualTotals.overhead,
        actual_total_cost: actualTotals.total,
        revenue,
        profit: profit.profit,
        profit_margin_pct: profit.margin_pct,
      })
      .eq('id', jobId);
    setSavingEstimates(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Costing snapshot saved.');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header — revenue input + save */}
      <div className="rounded-xl border bg-card p-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
        <div className="w-full md:flex-1 md:min-w-[200px]">
          <Label htmlFor="job-revenue" className="text-xs">Revenue (from invoice)</Label>
          <Input
            id="job-revenue"
            type="number"
            min={0}
            step={0.01}
            value={revenue}
            onChange={(e) => setRevenue(parseFloat(e.target.value) || 0)}
            className="h-9 text-base md:text-sm tabular-nums"
          />
        </div>
        <div className="text-left md:text-right">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Profit margin
          </p>
          <p
            data-testid="costing-margin"
            data-status={profit.status}
            className={cn(
              'text-2xl font-bold tabular-nums',
              profit.tone === 'green' && 'text-green-700',
              profit.tone === 'yellow' && 'text-amber-700',
              profit.tone === 'red' && 'text-red-700',
              profit.tone === 'gray' && 'text-muted-foreground',
            )}
          >
            {profit.margin_label}
          </p>
          {profit.status === 'ok' ? (
            <p className="text-[11px] text-muted-foreground tabular-nums" data-testid="costing-profit">
              {fmtUsd(profit.profit)} profit on {fmtUsd(profit.revenue)} revenue
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground" data-testid="costing-status">
              {profit.status === 'no_cost_data' && 'No cost data yet — log labor or materials.'}
              {profit.status === 'rate_not_set' && 'Rate not set — some labor is unpriced.'}
              {profit.status === 'no_revenue' && 'Set revenue to see margin.'}
            </p>
          )}
        </div>
        <Button
          onClick={saveSnapshot}
          disabled={savingEstimates}
          className="gap-1.5 w-full md:w-auto"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {savingEstimates
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Save className="h-3.5 w-3.5" />}
          Save snapshot
        </Button>
      </div>

      {/* Rate-not-set warning — labor is understated, so the margin is hidden. */}
      {!ratesComplete && (
        <div
          data-testid="costing-rate-warning"
          className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          <p className="font-semibold">
            {actualLabor.unratedProfileIds.length} worker{actualLabor.unratedProfileIds.length === 1 ? '' : 's'} on
            this job {actualLabor.unratedProfileIds.length === 1 ? 'has' : 'have'} no pay rate set.
          </p>
          <p className="text-[12px] text-amber-700/90 mt-0.5">
            Their hours are tracked but unpriced, so labor cost is understated and the margin is hidden.
            Set an hourly rate on the crew member (or a company default) to see a true margin.
          </p>
        </div>
      )}

      {/* Cost matrix — stacked rows on mobile, 4-column grid on desktop. */}
      <div data-testid="cost-matrix" className="rounded-xl border bg-card overflow-hidden text-sm">
        {/* Column headers (desktop only) */}
        <div className="hidden md:grid md:grid-cols-[1fr_8rem_8rem_8rem] md:gap-3 px-4 py-2.5 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          <span>Cost type</span>
          <span className="text-right">Estimated</span>
          <span className="text-right">Actual</span>
          <span className="text-right">Variance</span>
        </div>
        <div className="divide-y">
            <CostRow
              actualTestId="costing-actual-labor"
              label="Labor"
              sub={`${fmtHours(estLaborHours)} estimated · ${fmtHours(actualLabor.hours)} actual (clock-tracked)`}
              estimatedInput={
                <div className="space-y-1">
                  <Input
                    type="number" step={0.5} min={0}
                    value={estLaborHours}
                    onChange={(e) => setEstLaborHours(parseFloat(e.target.value) || 0)}
                    className="h-9 md:h-7 text-base md:text-xs tabular-nums"
                    placeholder="hrs"
                  />
                  <Input
                    type="number" step={0.01} min={0}
                    value={estLaborCost}
                    onChange={(e) => setEstLaborCost(parseFloat(e.target.value) || 0)}
                    className="h-9 md:h-7 text-base md:text-xs tabular-nums"
                    placeholder="$"
                  />
                </div>
              }
              actual={actualLabor.cost}
              estimated={estLaborCost}
            />
            <CostRow
              actualTestId="costing-actual-materials"
              label="Materials"
              sub={`Sum of ${costEntries.filter((e) => e.category === 'material').length} cost entries`}
              estimatedInput={
                <Input
                  type="number" step={0.01} min={0}
                  value={estMaterialsCost}
                  onChange={(e) => setEstMaterialsCost(parseFloat(e.target.value) || 0)}
                  className="h-9 md:h-7 text-base md:text-xs tabular-nums"
                />
              }
              actual={actualMaterials}
              estimated={estMaterialsCost}
            />
            <CostRow
              actualTestId="costing-actual-equipment"
              label="Equipment"
              sub={`Sum of ${costEntries.filter((e) => e.category === 'equipment').length} cost entries`}
              estimatedInput={
                <Input
                  type="number" step={0.01} min={0}
                  value={estEquipmentCost}
                  onChange={(e) => setEstEquipmentCost(parseFloat(e.target.value) || 0)}
                  className="h-9 md:h-7 text-base md:text-xs tabular-nums"
                />
              }
              actual={actualEquipment}
              estimated={estEquipmentCost}
            />
            <CostRow
              actualTestId="costing-actual-overhead"
              label={`Overhead (${overheadPct}%)`}
              sub="Auto-applied to labor + materials + equipment"
              estimatedInput={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmtUsd(estimatedTotals.overhead)}
                </span>
              }
              actual={actualTotals.overhead}
              estimated={estimatedTotals.overhead}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 font-bold bg-muted/30 md:grid-cols-[1fr_8rem_8rem_8rem] md:gap-3 md:items-center md:py-2.5">
              <span className="col-span-2 md:col-span-1">Total cost</span>
              <span className="tabular-nums md:text-right">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1 md:hidden">Est</span>
                {fmtUsd(estimatedTotals.total)}
              </span>
              <span className="tabular-nums md:text-right">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1 md:hidden">Actual</span>
                {fmtUsd(actualTotals.total)}
              </span>
              <span className="col-span-2 md:col-span-1 md:text-right">
                <VarianceChip actual={actualTotals.total} estimated={estimatedTotals.total} />
              </span>
            </div>
        </div>
      </div>

      {/* Cost entries section */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Cost entries ({costEntries.length})
          </p>
        </div>
        {costEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-4 py-6 text-center">
            No materials or equipment logged yet. Add the first entry below.
          </p>
        ) : (
          <ul className="divide-y">
            {costEntries.map((e) => (
              <li key={e.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted shrink-0">
                  {e.category === 'material' ? (
                    <Package className="h-3 w-3 text-muted-foreground" />
                  ) : e.category === 'equipment' ? (
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ClipboardList className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{e.description}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {Number(e.quantity)} × {fmtUsd(Number(e.unit_cost))} = {fmtUsd(Number(e.total_cost))}
                  </span>
                </span>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => setConfirmDelete(e)}
                  aria-label="Remove entry"
                  title="Remove entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add-entry inline form */}
        <div className="border-t bg-muted/20 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_80px_100px_auto] gap-2 items-end">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</Label>
              <Select
                value={entryCategory}
                onValueChange={(v) => setEntryCategory((v ?? 'material') as JobCostCategory)}
              >
                <SelectTrigger className="h-10 sm:h-8 text-base sm:text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</Label>
              <Input
                value={entryDesc}
                onChange={(e) => setEntryDesc(e.target.value)}
                placeholder="20 bags mulch"
                className="h-10 sm:h-8 text-base sm:text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty</Label>
              <Input
                type="number" step={0.5} min={0}
                value={entryQty}
                onChange={(e) => setEntryQty(parseFloat(e.target.value) || 0)}
                className="h-10 sm:h-8 text-base sm:text-xs tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit $</Label>
              <Input
                type="number" step={0.01} min={0}
                value={entryUnitCost}
                onChange={(e) => setEntryUnitCost(parseFloat(e.target.value) || 0)}
                className="h-10 sm:h-8 text-base sm:text-xs tabular-nums"
              />
            </div>
            <Button
              onClick={addEntry}
              disabled={adding || !entryDesc.trim()}
              size="sm"
              className="gap-1.5 h-10 sm:h-8 w-full sm:w-auto"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Remove "${confirmDelete?.description ?? ''}"?`}
        description="This deletes the cost entry. The job's actual cost will recalculate."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (confirmDelete) await removeEntry(confirmDelete); }}
      />
    </div>
  );
}

function CostRow({
  label, sub, estimatedInput, actual, estimated, actualTestId,
}: {
  label: string;
  sub?: string;
  estimatedInput: React.ReactNode;
  actual: number;
  estimated: number;
  actualTestId?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1fr_8rem_8rem_8rem] md:gap-3 md:items-center md:py-2.5">
      <div className="col-span-2 md:col-span-1">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="tabular-nums md:text-right">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 md:hidden">Estimated</p>
        {estimatedInput}
      </div>
      <div className="tabular-nums md:text-right">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 md:hidden">Actual</p>
        <span data-testid={actualTestId}>{fmtUsd(actual)}</span>
      </div>
      <div className="col-span-2 md:col-span-1 md:text-right">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 md:hidden">Variance</p>
        <VarianceChip actual={actual} estimated={estimated} />
      </div>
    </div>
  );
}

function VarianceChip({ actual, estimated }: { actual: number; estimated: number }) {
  const tone = varianceTone(actual, estimated);
  if (estimated === 0 && actual === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const delta = actual - estimated;
  const prefix = delta > 0 ? '+' : '';
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
      TONE_BG[tone],
    )}>
      {prefix}{fmtUsd(delta)}
    </span>
  );
}
