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
}

const TONE_BG = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};

export function JobCostingTab({
  jobId, companyId, userId, initialEstimated, initialRevenue, overheadPct,
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

      // Pull rates for any profile that clocked in.
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
          for (const r of (rateRows ?? []) as CrewMemberRate[]) {
            if (!seen.has(r.profile_id)) seen.set(r.profile_id, {
              profile_id: r.profile_id,
              hourly_rate: Number(r.hourly_rate ?? 25),
              labor_burden_pct: Number(r.labor_burden_pct ?? 25),
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
    () => actualLaborFromClock(intervals, crewRates),
    [intervals, crewRates]
  );
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

  const profit = useMemo(
    () => profitSummary(revenue, actualTotals.total),
    [revenue, actualTotals.total]
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
      <div className="rounded-xl border bg-card p-4 flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="job-revenue" className="text-xs">Revenue (from invoice)</Label>
          <Input
            id="job-revenue"
            type="number"
            min={0}
            step={0.01}
            value={revenue}
            onChange={(e) => setRevenue(parseFloat(e.target.value) || 0)}
            className="h-9 text-sm tabular-nums"
          />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Profit margin
          </p>
          <p className={cn(
            'text-2xl font-bold tabular-nums',
            profit.tone === 'green' && 'text-green-700',
            profit.tone === 'yellow' && 'text-amber-700',
            profit.tone === 'red' && 'text-red-700',
            profit.tone === 'gray' && 'text-muted-foreground',
          )}>
            {profit.margin_pct.toFixed(1)}%
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {fmtUsd(profit.profit)} profit on {fmtUsd(profit.revenue)} revenue
          </p>
        </div>
        <Button
          onClick={saveSnapshot}
          disabled={savingEstimates}
          className="gap-1.5"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {savingEstimates
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Save className="h-3.5 w-3.5" />}
          Save snapshot
        </Button>
      </div>

      {/* Cost matrix */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Cost type</th>
              <th className="text-right px-4 py-2.5 font-semibold w-32">Estimated</th>
              <th className="text-right px-4 py-2.5 font-semibold w-32">Actual</th>
              <th className="text-right px-4 py-2.5 font-semibold w-32">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <CostRow
              label="Labor"
              sub={`${fmtHours(estLaborHours)} estimated · ${fmtHours(actualLabor.hours)} actual (clock-tracked)`}
              estimatedInput={
                <div className="space-y-1">
                  <Input
                    type="number" step={0.5} min={0}
                    value={estLaborHours}
                    onChange={(e) => setEstLaborHours(parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs tabular-nums"
                    placeholder="hrs"
                  />
                  <Input
                    type="number" step={0.01} min={0}
                    value={estLaborCost}
                    onChange={(e) => setEstLaborCost(parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs tabular-nums"
                    placeholder="$"
                  />
                </div>
              }
              actual={actualLabor.cost}
              estimated={estLaborCost}
            />
            <CostRow
              label="Materials"
              sub={`Sum of ${costEntries.filter((e) => e.category === 'material').length} cost entries`}
              estimatedInput={
                <Input
                  type="number" step={0.01} min={0}
                  value={estMaterialsCost}
                  onChange={(e) => setEstMaterialsCost(parseFloat(e.target.value) || 0)}
                  className="h-7 text-xs tabular-nums"
                />
              }
              actual={actualMaterials}
              estimated={estMaterialsCost}
            />
            <CostRow
              label="Equipment"
              sub={`Sum of ${costEntries.filter((e) => e.category === 'equipment').length} cost entries`}
              estimatedInput={
                <Input
                  type="number" step={0.01} min={0}
                  value={estEquipmentCost}
                  onChange={(e) => setEstEquipmentCost(parseFloat(e.target.value) || 0)}
                  className="h-7 text-xs tabular-nums"
                />
              }
              actual={actualEquipment}
              estimated={estEquipmentCost}
            />
            <CostRow
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
            <tr className="font-bold bg-muted/30">
              <td className="px-4 py-2.5">Total cost</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {fmtUsd(estimatedTotals.total)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {fmtUsd(actualTotals.total)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <VarianceChip actual={actualTotals.total} estimated={estimatedTotals.total} />
              </td>
            </tr>
          </tbody>
        </table>
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
                <SelectTrigger className="h-8 text-xs">
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
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty</Label>
              <Input
                type="number" step={0.5} min={0}
                value={entryQty}
                onChange={(e) => setEntryQty(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit $</Label>
              <Input
                type="number" step={0.01} min={0}
                value={entryUnitCost}
                onChange={(e) => setEntryUnitCost(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <Button
              onClick={addEntry}
              disabled={adding || !entryDesc.trim()}
              size="sm"
              className="gap-1.5 h-8"
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
  label, sub, estimatedInput, actual, estimated,
}: {
  label: string;
  sub?: string;
  estimatedInput: React.ReactNode;
  actual: number;
  estimated: number;
}) {
  return (
    <tr>
      <td className="px-4 py-2.5">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums w-32">
        {estimatedInput}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {fmtUsd(actual)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <VarianceChip actual={actual} estimated={estimated} />
      </td>
    </tr>
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
