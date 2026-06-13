'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Plus, Trash2, Camera, X, Package } from 'lucide-react';
import { toast } from 'sonner';
import { fmtUsd } from '@/lib/job-costing';
import type { JobCostEntry } from '@/types';

/**
 * Crew-facing materials & expenses logger on the job completion flow. Each row
 * writes a job_cost_entries row (category 'material', qty 1) immediately — so
 * even if the crew bails before completing, the cost is captured and the
 * profit rollup (trigger 032) recomputes. An optional receipt photo uploads to
 * the public job-photos bucket; its URL is attached to the entry via
 * receipt_url when that column exists (migration 048) and skipped otherwise,
 * so logging materials works on any schema.
 */
export function MaterialsEntry({
  jobId, companyId, userId,
}: {
  jobId: string;
  companyId: string;
  userId: string;
}) {
  const supabase = createClient();
  const [entries, setEntries] = useState<JobCostEntry[]>([]);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('job_cost_entries')
      .select('*')
      .eq('job_id', jobId)
      .eq('category', 'material')
      .order('added_at', { ascending: true })
      .then(({ data }) => { if (!cancelled) setEntries((data ?? []) as JobCostEntry[]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function pickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceipt(f);
      setReceiptPreview(URL.createObjectURL(f));
    }
    e.target.value = '';
  }

  function clearReceipt() {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceipt(null);
    setReceiptPreview(null);
  }

  async function add() {
    if (!name.trim()) {
      toast.error('Name the material or expense.');
      return;
    }
    setAdding(true);
    const costNum = parseFloat(cost) || 0;

    // 1) Insert the entry first — uses only columns present on every schema.
    const { data, error } = await supabase
      .from('job_cost_entries')
      .insert({
        company_id: companyId,
        job_id: jobId,
        category: 'material',
        description: name.trim(),
        quantity: 1,
        unit_cost: costNum,
        added_by: userId,
      })
      .select('*')
      .single();
    if (error || !data) {
      setAdding(false);
      toast.error(error?.message ?? 'Could not log this expense.');
      return;
    }
    let saved = data as JobCostEntry;

    // 2) Optional receipt → upload to the public job-photos bucket, then
    //    attach via receipt_url. The update no-ops gracefully if the column
    //    isn't there yet (migration 048) — the expense is already saved.
    if (receipt) {
      try {
        const ext = (receipt.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${companyId}/${jobId}/receipt-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase
          .storage.from('job-photos')
          .upload(path, receipt, { contentType: receipt.type, upsert: false });
        if (!upErr) {
          const { data: pub } = supabase.storage.from('job-photos').getPublicUrl(path);
          const { data: upd, error: updErr } = await supabase
            .from('job_cost_entries')
            .update({ receipt_url: pub.publicUrl })
            .eq('id', saved.id)
            .select('*')
            .single();
          if (!updErr && upd) saved = upd as JobCostEntry;
        }
      } catch {
        // Receipt is optional; the expense row is already saved.
      }
    }

    setEntries((prev) => [...prev, saved]);
    setName('');
    setCost('');
    clearReceipt();
    setAdding(false);
    toast.success('Expense logged.');
  }

  async function remove(entry: JobCostEntry) {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    const { error } = await supabase.from('job_cost_entries').delete().eq('id', entry.id);
    if (error) {
      toast.error(error.message);
      setEntries((prev) => [...prev, entry]); // restore on failure
    }
  }

  const total = entries.reduce((s, e) => s + Number(e.total_cost ?? 0), 0);
  const receiptUrl = (e: JobCostEntry) => (e as { receipt_url?: string | null }).receipt_url ?? null;

  return (
    <div className="space-y-2" data-testid="crew-materials">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Materials &amp; expenses (optional)</span>
      </div>

      {entries.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="material-row">
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{e.description}</span>
                {receiptUrl(e) && (
                  <a
                    href={receiptUrl(e)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] underline"
                    style={{ color: 'var(--orange-deep)' }}
                  >
                    📎 receipt
                  </a>
                )}
              </span>
              <span className="tabular-nums shrink-0">{fmtUsd(Number(e.total_cost ?? 0))}</span>
              <button
                type="button"
                onClick={() => remove(e)}
                aria-label="Remove expense"
                className="-m-1.5 p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          <li className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-muted/30">
            <span>Total materials</span>
            <span className="tabular-nums" data-testid="materials-total">{fmtUsd(total)}</span>
          </li>
        </ul>
      )}

      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What did you buy? (e.g. 20 bags mulch)"
            aria-label="Material or expense name"
            className="flex-1 min-w-0 rounded-md border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="decimal"
            placeholder="$0"
            aria-label="Cost"
            className="w-24 rounded-md border bg-background px-3 py-2 text-base text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {receiptPreview ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptPreview} alt="receipt" className="h-12 w-12 rounded object-cover border" />
            <button
              type="button"
              onClick={clearReceipt}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" /> Remove receipt
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--orange-deep)' }}
          >
            <Camera className="h-4 w-4" /> Attach receipt photo
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pickReceipt}
        />

        <button
          type="button"
          onClick={add}
          disabled={adding || !name.trim()}
          data-testid="add-material"
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--orange)' }}
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add expense
        </button>
      </div>
    </div>
  );
}
