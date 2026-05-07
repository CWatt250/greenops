'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Service, JobLineItem } from '@/types';

export interface LineItemDraft {
  id?: string;         // set after DB insert
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total?: number;      // read back from DB generated column
  _key: string;        // local React key
}

interface LineItemsTableProps {
  jobId?: string;       // when editing existing job
  initialItems?: JobLineItem[];
  onChange?: (items: LineItemDraft[]) => void;
}

export function LineItemsTable({ jobId, initialItems = [], onChange }: LineItemsTableProps) {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [items, setItems] = useState<LineItemDraft[]>(
    initialItems.map((li) => ({
      id: li.id,
      service_id: li.service_id ?? null,
      description: li.description ?? '',
      quantity: li.quantity,
      unit_price: li.unit_price,
      total: li.total,
      _key: li.id,
    }))
  );
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setServices((data ?? []) as Service[]));
  }, []);

  useEffect(() => {
    onChange?.(items);
  }, [items]);

  function addRow() {
    setItems((prev) => [
      ...prev,
      {
        service_id: null,
        description: '',
        quantity: 1,
        unit_price: 0,
        _key: crypto.randomUUID(),
      },
    ]);
  }

  function updateItem(key: string, patch: Partial<LineItemDraft>) {
    setItems((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item))
    );
  }

  function onServiceSelect(key: string, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    updateItem(key, {
      service_id: serviceId,
      description: svc.name,
      unit_price: svc.base_price,
    });
  }

  async function removeItem(key: string) {
    const item = items.find((i) => i._key === key);
    if (item?.id && jobId) {
      await supabase.from('job_line_items').delete().eq('id', item.id);
    }
    setItems((prev) => prev.filter((i) => i._key !== key));
  }

  // Called by parent when job ID is available (after job insert)
  // Returns items with DB-assigned IDs and generated totals
  async function persistItems(forJobId: string): Promise<JobLineItem[]> {
    const toInsert = items.filter((i) => !i.id);
    if (!toInsert.length) return initialItems;

    const { data, error } = await supabase
      .from('job_line_items')
      .insert(
        toInsert.map((i) => ({
          job_id: forJobId,
          service_id: i.service_id ?? null,
          description: i.description || null,
          quantity: i.quantity,
          unit_price: i.unit_price,
        }))
      )
      .select('*');

    if (error) throw error;
    return (data ?? []) as JobLineItem[];
  }

  const grandTotal = items.reduce((sum, i) => sum + (i.total ?? i.quantity * i.unit_price), 0);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_90px_36px] gap-2 px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service / Description</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Qty</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Unit Price</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</span>
        <span />
      </div>

      {/* Rows */}
      {items.map((item) => (
        <div key={item._key} className="grid grid-cols-[1fr_80px_100px_90px_36px] gap-2 items-center">
          {/* Service selector + description */}
          <div className="space-y-1">
            <Select
              value={item.service_id ?? ''}
              onValueChange={(v) => onServiceSelect(item._key, v ?? '')}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick a service…" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {(item.service_id === '__custom__' || (!item.service_id && item.description)) && (
              <Input
                className="h-7 text-xs"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(item._key, { description: e.target.value })}
              />
            )}
          </div>

          {/* Qty */}
          <Input
            type="number"
            min="0.01"
            step="0.01"
            className="h-8 text-xs text-center"
            value={item.quantity}
            onChange={(e) =>
              updateItem(item._key, { quantity: parseFloat(e.target.value) || 1 })
            }
          />

          {/* Unit price */}
          <Input
            type="number"
            min="0"
            step="0.01"
            className="h-8 text-xs text-right"
            value={item.unit_price}
            onChange={(e) =>
              updateItem(item._key, { unit_price: parseFloat(e.target.value) || 0 })
            }
          />

          {/* Total */}
          <div className="text-right text-sm font-medium tabular-nums">
            {formatCurrency(item.total ?? item.quantity * item.unit_price)}
          </div>

          {/* Delete */}
          <button
            type="button"
            onClick={() => removeItem(item._key)}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Add row */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addRow}
        className="h-8 text-xs text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add line item
      </Button>

      {/* Grand total */}
      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--color-brand-green-raw)' }}>
              {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Export so parent can call it
LineItemsTable.persistItems = async (
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  items: LineItemDraft[]
): Promise<JobLineItem[]> => {
  const toInsert = items.filter((i) => !i.id);
  if (!toInsert.length) return [];

  const { data, error } = await supabase
    .from('job_line_items')
    .insert(
      toInsert.map((i) => ({
        job_id: jobId,
        service_id: i.service_id && i.service_id !== '__custom__' ? i.service_id : null,
        description: i.description || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }))
    )
    .select('*');

  if (error) throw error;
  return (data ?? []) as JobLineItem[];
};
