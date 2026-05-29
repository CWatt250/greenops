'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Plus, Trash2, Clock, Search, Sparkles } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { Service, JobService } from '@/types';

/**
 * One editable service row in the picker. Mirrors the `job_services` columns —
 * `custom_name` is the editable display name (seeded from the catalog service,
 * or freeform for a one-off), `duration_minutes` × `quantity` feeds VROOM, and
 * `price` × `quantity` feeds the invoice total.
 */
export interface ServiceDraft {
  id?: string;                       // set once persisted
  service_id: string | null;         // null = custom / one-off
  custom_name: string;
  quantity: number;
  duration_minutes: number | null;
  price: number;
  notes?: string | null;
  _key: string;                      // local React key
}

interface ServicePickerProps {
  /** Existing rows when editing a job. */
  initialItems?: JobService[];
  onChange?: (items: ServiceDraft[]) => void;
}

function makeKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `k${Math.random().toString(36).slice(2)}`
  );
}

function draftFromService(svc: Service): ServiceDraft {
  return {
    service_id: svc.id,
    custom_name: svc.name,
    quantity: 1,
    duration_minutes: svc.estimated_duration_minutes ?? null,
    price: Number(svc.base_price ?? 0),
    notes: null,
    _key: makeKey(),
  };
}

function draftCustom(): ServiceDraft {
  return {
    service_id: null,
    custom_name: '',
    quantity: 1,
    duration_minutes: null,
    price: 0,
    notes: null,
    _key: makeKey(),
  };
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 min';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Shared, searchable services picker — the proposal line-item picker pattern,
 * extracted for reuse. Searchable dropdown of catalog services (seeding default
 * duration + price), an "add custom service" escape hatch for one-offs, inline
 * row editing, and running totals for both on-site time and price.
 */
export function ServicePicker({ initialItems = [], onChange }: ServicePickerProps) {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ServiceDraft[]>(
    initialItems.map((s) => ({
      id: s.id,
      service_id: s.service_id ?? null,
      custom_name: s.custom_name ?? s.service?.name ?? '',
      quantity: Number(s.quantity ?? 1),
      duration_minutes: s.duration_minutes ?? null,
      price: Number(s.price ?? 0),
      notes: s.notes ?? null,
      _key: s.id,
    }))
  );

  useEffect(() => {
    supabase
      .from('services')
      .select('id, name, category, unit, base_price, estimated_duration_minutes, is_active')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setServices((data ?? []) as Service[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange?.(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function addFromService(svc: Service) {
    setItems((prev) => [...prev, draftFromService(svc)]);
    setPickerOpen(false);
    setQuery('');
  }

  function addCustom() {
    setItems((prev) => [...prev, draftCustom()]);
  }

  function update(key: string, patch: Partial<ServiceDraft>) {
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
  }

  async function remove(key: string) {
    const item = items.find((i) => i._key === key);
    if (item?.id) {
      await supabase.from('job_services').delete().eq('id', item.id);
    }
    setItems((prev) => prev.filter((i) => i._key !== key));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, query]);

  const totalDuration = items.reduce(
    (sum, i) => sum + (i.duration_minutes ?? 0) * (i.quantity || 0),
    0,
  );
  const totalPrice = items.reduce(
    (sum, i) => sum + i.price * (i.quantity || 0),
    0,
  );

  return (
    <div className="space-y-3">
      {/* Add controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            aria-expanded={pickerOpen}
          >
            <Search className="h-3.5 w-3.5" /> Add service
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search services…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                  No services found.
                </CommandEmpty>
                {filtered.length > 0 && (
                  <CommandGroup heading="Services catalog">
                    {filtered.map((svc) => (
                      <CommandItem
                        key={svc.id}
                        value={svc.name}
                        onSelect={() => addFromService(svc)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{svc.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatCurrency(svc.base_price)}
                            {svc.estimated_duration_minutes
                              ? ` · ${svc.estimated_duration_minutes} min`
                              : ''}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCustom}
          className="gap-1.5 border-dashed"
        >
          <Sparkles className="h-3.5 w-3.5" /> Add custom service
        </Button>
      </div>

      {/* Rows */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic rounded-md border border-dashed px-3 py-6 text-center">
          No services yet. Search the catalog or add a custom service.
        </p>
      ) : (
        <ul className="space-y-2">
          {/* Column header (sm+) */}
          <li className="hidden sm:grid grid-cols-[1fr_70px_90px_90px_36px] gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Service</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Qty</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Min</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Price</span>
            <span />
          </li>
          {items.map((it) => (
            <li
              key={it._key}
              className="grid grid-cols-[1fr_70px_90px_90px_36px] gap-2 items-center rounded-md border bg-card/50 p-2 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <Input
                value={it.custom_name}
                onChange={(e) => update(it._key, { custom_name: e.target.value })}
                placeholder="Service name"
                aria-label="Service name"
                className="h-8 text-sm"
              />
              <Input
                type="number"
                min={0}
                step={0.5}
                value={it.quantity}
                onChange={(e) => update(it._key, { quantity: parseFloat(e.target.value) || 0 })}
                aria-label="Quantity"
                className="h-8 text-xs text-center tabular-nums"
              />
              <Input
                type="number"
                min={0}
                step={5}
                value={it.duration_minutes ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  update(it._key, { duration_minutes: v === '' ? null : parseInt(v, 10) || 0 });
                }}
                aria-label="Duration in minutes"
                placeholder="—"
                className="h-8 text-xs text-center tabular-nums"
              />
              <Input
                type="number"
                min={0}
                step={0.01}
                value={it.price}
                onChange={(e) => update(it._key, { price: parseFloat(e.target.value) || 0 })}
                aria-label="Price"
                className="h-8 text-xs text-right tabular-nums"
              />
              <button
                type="button"
                onClick={() => remove(it._key)}
                aria-label="Remove service"
                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Running totals */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t pt-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Total time{' '}
            <span className="font-semibold tabular-nums text-foreground" data-testid="services-total-duration">
              {formatDuration(totalDuration)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">Total</span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: 'var(--color-brand-green-raw)' }}
              data-testid="services-total-price"
            >
              {formatCurrency(totalPrice)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Persist drafts to `job_services` for a job. Inserts new rows (no `id`) and
 * leaves existing rows untouched — inline edits to existing rows are written by
 * the caller, and removals are handled in-component. Returns inserted rows.
 */
export async function persistJobServices(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  items: ServiceDraft[],
): Promise<JobService[]> {
  // Update existing rows that may have been edited inline.
  const existing = items.filter((i) => i.id);
  for (const i of existing) {
    await supabase
      .from('job_services')
      .update({
        service_id: i.service_id,
        custom_name: i.custom_name || null,
        quantity: i.quantity,
        duration_minutes: i.duration_minutes,
        price: i.price,
        notes: i.notes ?? null,
      })
      .eq('id', i.id!);
  }

  const toInsert = items.filter((i) => !i.id);
  if (!toInsert.length) return [];

  const { data, error } = await supabase
    .from('job_services')
    .insert(
      toInsert.map((i, idx) => ({
        job_id: jobId,
        service_id: i.service_id,
        custom_name: i.custom_name || null,
        quantity: i.quantity,
        duration_minutes: i.duration_minutes,
        price: i.price,
        notes: i.notes ?? null,
        sort_order: idx,
      })),
    )
    .select('*');

  if (error) throw error;
  return (data ?? []) as JobService[];
}
