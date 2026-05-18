'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Wrench, Scissors, Leaf, Droplets, Snowflake, TreePine, Zap, Package, Pencil, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { Service, ServiceCategory } from '@/types';

const categoryConfig: Record<ServiceCategory, { label: string; icon: React.ReactNode }> = {
  mowing:        { label: 'Mowing',        icon: <Scissors className="h-5 w-5" /> },
  edging:        { label: 'Edging',        icon: <Leaf className="h-5 w-5" /> },
  cleanup:       { label: 'Cleanup',       icon: <Package className="h-5 w-5" /> },
  fertilization: { label: 'Fertilization', icon: <Leaf className="h-5 w-5" /> },
  aeration:      { label: 'Aeration',      icon: <Droplets className="h-5 w-5" /> },
  overseeding:   { label: 'Overseeding',   icon: <Leaf className="h-5 w-5" /> },
  mulch:         { label: 'Mulch',         icon: <Package className="h-5 w-5" /> },
  tree:          { label: 'Tree',          icon: <TreePine className="h-5 w-5" /> },
  sprinkler:     { label: 'Sprinkler',     icon: <Droplets className="h-5 w-5" /> },
  snow:          { label: 'Snow',          icon: <Snowflake className="h-5 w-5" /> },
  holiday:       { label: 'Holiday',       icon: <Zap className="h-5 w-5" /> },
  other:         { label: 'Other',         icon: <Wrench className="h-5 w-5" /> },
};

// Visual section order across the page. Object key order isn't a contract,
// so define it explicitly.
const SECTION_ORDER: ServiceCategory[] = [
  'mowing', 'edging', 'cleanup', 'fertilization', 'aeration', 'overseeding',
  'mulch', 'tree', 'sprinkler', 'snow', 'holiday', 'other',
];

type SortMode = 'alpha' | 'recent' | 'used';

const serviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.enum([
    'mowing','edging','fertilization','aeration','overseeding','mulch',
    'cleanup','tree','sprinkler','snow','holiday','other',
  ]),
  unit: z.enum(['per_visit','per_sqft','per_hour','flat','per_unit','per_yard']),
  base_price: z.number().min(0, 'Price must be 0 or more'),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const unitLabel: Record<string, string> = {
  per_visit: 'Per Visit',
  per_sqft: 'Per Sq Ft',
  per_hour: 'Per Hour',
  flat: 'Flat',
  per_unit: 'Per Unit',
  per_yard: 'Per Yard',
};

export default function ServicesPage() {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [usageById, setUsageById] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { category: 'mowing', unit: 'per_visit', base_price: 0 },
  });

  async function load() {
    setLoading(true);
    const [svcRes, jobLineRes, invLineRes] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase.from('job_line_items').select('service_id'),
      supabase.from('invoice_line_items').select('service_id'),
    ]);

    setServices((svcRes.data ?? []) as Service[]);

    const counts: Record<string, number> = {};
    for (const row of (jobLineRes.data ?? []) as { service_id: string | null }[]) {
      if (row.service_id) counts[row.service_id] = (counts[row.service_id] ?? 0) + 1;
    }
    for (const row of (invLineRes.data ?? []) as { service_id: string | null }[]) {
      if (row.service_id) counts[row.service_id] = (counts[row.service_id] ?? 0) + 1;
    }
    setUsageById(counts);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setServerError(null);
    reset({ name: '', description: '', category: 'mowing', unit: 'per_visit', base_price: 0 });
    setSheetOpen(true);
  }

  function openEdit(service: Service) {
    setEditingId(service.id);
    setServerError(null);
    reset({
      name: service.name,
      description: service.description ?? '',
      category: service.category,
      unit: service.unit,
      base_price: Number(service.base_price),
    });
    setSheetOpen(true);
  }

  async function onSubmit(data: ServiceFormData) {
    setServerError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    if (!profile?.company_id) { setServerError('No company found'); return; }

    if (editingId) {
      const { error } = await supabase
        .from('services')
        .update(data)
        .eq('id', editingId);
      if (error) { setServerError(error.message); return; }
      toast.success('Service updated.');
    } else {
      const { error } = await supabase.from('services').insert({
        ...data,
        company_id: profile.company_id,
      });
      if (error) { setServerError(error.message); return; }
      toast.success('Service added.');
    }

    setSheetOpen(false);
    setEditingId(null);
    load();
  }

  async function toggleActive(service: Service) {
    await supabase
      .from('services')
      .update({ is_active: !service.is_active })
      .eq('id', service.id);
    setServices((prev) =>
      prev.map((s) => s.id === service.id ? { ...s, is_active: !s.is_active } : s)
    );
  }

  async function handleDelete(service: Service) {
    const { error } = await supabase.from('services').delete().eq('id', service.id);
    if (error) {
      // FK violations from existing job_line_items pointing here, etc.
      toast.error(error.message.includes('foreign')
        ? 'This service is used by existing jobs/invoices. Mark it inactive instead.'
        : error.message);
      return;
    }
    toast.success('Service deleted.');
    setServices((prev) => prev.filter((s) => s.id !== service.id));
  }

  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const visible = useMemo(() => {
    const filtered = isSearching
      ? services.filter((s) => {
          const haystack = `${s.name} ${s.description ?? ''}`.toLowerCase();
          return haystack.includes(trimmedSearch);
        })
      : services;

    const sorter = (a: Service, b: Service) => {
      if (sortMode === 'recent') {
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      }
      if (sortMode === 'used') {
        const ua = usageById[a.id] ?? 0;
        const ub = usageById[b.id] ?? 0;
        if (ub !== ua) return ub - ua;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    };

    return [...filtered].sort(sorter);
  }, [services, trimmedSearch, isSearching, sortMode, usageById]);

  // Group by category for non-search view; preserve sort within each section.
  const grouped: { category: ServiceCategory; items: Service[] }[] = useMemo(() => {
    const buckets = new Map<ServiceCategory, Service[]>();
    for (const svc of visible) {
      const cat = svc.category;
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(svc);
    }
    return SECTION_ORDER
      .filter((c) => buckets.has(c))
      .map((c) => ({ category: c, items: buckets.get(c)! }));
  }, [visible]);

  function renderCard(service: Service) {
    const cat = categoryConfig[service.category];
    const usage = usageById[service.id] ?? 0;
    return (
      <div
        key={service.id}
        className={cn(
          'group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-all',
          !service.is_active && 'opacity-50 grayscale'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {cat?.icon}
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={service.is_active}
              onCheckedChange={() => toggleActive(service)}
              aria-label={service.is_active ? 'Deactivate service' : 'Activate service'}
              title={service.is_active ? 'Active — appears in proposals & invoices' : 'Inactive — hidden from pickers'}
            />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-sm">{service.name}</h3>
          {service.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {service.description}
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between">
          <span className="text-xs text-muted-foreground capitalize">
            {unitLabel[service.unit] ?? service.unit}
          </span>
          <span className="font-bold text-sm" style={{ color: 'var(--orange)' }}>
            {formatCurrency(service.base_price)}
          </span>
        </div>
        {sortMode === 'used' && usage > 0 && (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground -mt-1">
            Used {usage}×
          </p>
        )}
        <div className="flex gap-1 pt-1 border-t -mx-5 px-5 -mb-2 pb-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Edit service"
            className="flex-1 gap-1 text-xs h-11 text-gray-700 hover:bg-gray-100"
            onClick={() => openEdit(service)}
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete service"
            className="flex-1 gap-1 text-xs h-11 text-red-600 hover:text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(service)}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Service Catalog" description="Manage your services and pricing">
        <Button
          onClick={openCreate}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Service
        </Button>
      </PageHeader>

      <PageIntro
        id="services"
        title="Service Catalog"
        description="Everything TLC offers and what you charge. Click any card to set its price or edit details — those prices auto-fill in proposals and invoices."
        steps={[
          'Click any service to set its price.',
          'Toggle services on/off as offerings change.',
          'Use search to quickly find a specific service.',
        ]}
      />

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search services… (e.g., "mowing", "snow")'
            className="pl-9"
            aria-label="Search services"
          />
        </div>
        <Select value={sortMode} onValueChange={(v) => setSortMode((v ?? 'alpha') as SortMode)}>
          <SelectTrigger className="sm:w-52" aria-label="Sort services">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha">Alphabetical (A–Z)</SelectItem>
            <SelectItem value="recent">Recently added</SelectItem>
            <SelectItem value="used">Most used</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No services yet"
          description="Services are the things you sell — mowing, mulching, fertilization, pruning. Set base prices once and they auto-fill into proposals and invoices."
          action={{ label: '+ Add your first service', onClick: openCreate }}
          secondaryAction={{
            label: 'Learn more about the catalog →',
            onClick: () => window.open('https://tlclandscapemanagement.com/learn', '_blank'),
          }}
        />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          No services match <strong>&ldquo;{search}&rdquo;</strong>.
        </p>
      ) : isSearching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(renderCard)}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <section key={category}>
              <div className="flex items-center gap-3 mb-3">
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground shrink-0"
                >
                  {categoryConfig[category]?.label ?? category}
                </h2>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add/Edit Service Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setEditingId(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit Service' : 'Add Service'}</SheetTitle>
            <SheetDescription>
              {editingId ? 'Update this service in your catalog.' : 'Add a new service to your catalog.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Service Name *</Label>
              <Input id="svc-name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="svc-desc">Description</Label>
              <Input id="svc-desc" {...register('description')} />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                defaultValue="mowing"
                onValueChange={(v) => setValue('category', v as ServiceFormData['category'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(categoryConfig) as ServiceCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>{categoryConfig[cat].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                defaultValue="per_visit"
                onValueChange={(v) => setValue('unit', v as ServiceFormData['unit'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(unitLabel).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="svc-price">Base Price ($) *</Label>
              <Input
                id="svc-price"
                type="number"
                step="0.01"
                min="0"
                {...register('base_price', { valueAsNumber: true })}
              />
              {errors.base_price && <p className="text-xs text-destructive">{errors.base_price.message}</p>}
            </div>

            {serverError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive">{serverError}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full text-white"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              {isSubmitting ? 'Saving…' : editingId ? 'Update Service' : 'Add Service'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.name ?? ''}"?`}
        description="This permanently removes the service from your catalog. If it's already used by jobs or invoices, deletion will fail — mark it inactive instead."
        confirmLabel="Delete service"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await handleDelete(confirmDelete);
        }}
      />
    </div>
  );
}
