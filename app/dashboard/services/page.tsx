'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
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
import { Plus, Wrench, Scissors, Leaf, Droplets, Snowflake, TreePine, Zap, Package, Pencil, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { Service, ServiceCategory } from '@/types';

const categoryConfig: Record<ServiceCategory, { label: string; icon: React.ReactNode }> = {
  mowing:        { label: 'Mowing',        icon: <Scissors className="h-5 w-5" /> },
  edging:        { label: 'Edging',        icon: <Leaf className="h-5 w-5" /> },
  fertilization: { label: 'Fertilization', icon: <Leaf className="h-5 w-5" /> },
  aeration:      { label: 'Aeration',      icon: <Droplets className="h-5 w-5" /> },
  cleanup:       { label: 'Cleanup',       icon: <Package className="h-5 w-5" /> },
  tree:          { label: 'Tree',          icon: <TreePine className="h-5 w-5" /> },
  sprinkler:     { label: 'Sprinkler',     icon: <Droplets className="h-5 w-5" /> },
  snow:          { label: 'Snow',          icon: <Snowflake className="h-5 w-5" /> },
  holiday:       { label: 'Holiday',       icon: <Zap className="h-5 w-5" /> },
  other:         { label: 'Other',         icon: <Wrench className="h-5 w-5" /> },
};

const serviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.enum(['mowing','edging','fertilization','aeration','cleanup','tree','sprinkler','snow','holiday','other']),
  unit: z.enum(['per_visit','per_sqft','per_hour','flat','per_unit']),
  base_price: z.number().min(0, 'Price must be 0 or more'),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const unitLabel: Record<string, string> = {
  per_visit: 'Per Visit',
  per_sqft: 'Per Sq Ft',
  per_hour: 'Per Hour',
  flat: 'Flat',
  per_unit: 'Per Unit',
};

export default function ServicesPage() {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'all'>('all');
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
    const { data } = await supabase.from('services').select('*').order('name');
    setServices((data ?? []) as Service[]);
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

  const categories = ['all', ...Object.keys(categoryConfig)] as const;
  const filtered = categoryFilter === 'all'
    ? services
    : services.filter((s) => s.category === categoryFilter);

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

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat as ServiceCategory | 'all')}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              categoryFilter === cat
                ? 'text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            style={
              categoryFilter === cat
                ? { backgroundColor: 'var(--orange)' }
                : {}
            }
          >
            {cat === 'all' ? 'All' : categoryConfig[cat as ServiceCategory]?.label ?? cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No services yet"
          description="Add your first service to the catalog."
          action={{ label: '+ Add Service', onClick: openCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((service) => {
            const cat = categoryConfig[service.category];
            return (
              <div
                key={service.id}
                className={cn(
                  'group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-opacity',
                  !service.is_active && 'opacity-60'
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
                      aria-label="Toggle active"
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
                <div className="flex gap-1 pt-1 border-t -mx-5 px-5 -mb-2 pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => openEdit(service)}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(service)}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
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
