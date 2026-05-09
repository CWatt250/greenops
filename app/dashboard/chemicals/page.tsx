'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FlaskConical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChemicalProduct, ChemicalProductType } from '@/types';

const TYPE_LABELS: Record<ChemicalProductType, string> = {
  herbicide: 'Herbicide',
  insecticide: 'Insecticide',
  fungicide: 'Fungicide',
  fertilizer: 'Fertilizer',
  growth_regulator: 'Growth regulator',
  other: 'Other',
};

const TYPE_COLORS: Record<ChemicalProductType, string> = {
  herbicide: 'bg-amber-100 text-amber-700',
  insecticide: 'bg-red-100 text-red-700',
  fungicide: 'bg-purple-100 text-purple-700',
  fertilizer: 'bg-green-100 text-green-700',
  growth_regulator: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function ChemicalsPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<ChemicalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ChemicalProduct | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChemicalProduct | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [epa, setEpa] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [productType, setProductType] = useState<ChemicalProductType>('herbicide');
  const [defaultRate, setDefaultRate] = useState<number>(0);
  const [rateUnit, setRateUnit] = useState('oz_per_gal');
  const [reiHours, setReiHours] = useState<number>(0);
  const [sdsUrl, setSdsUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('chemical_products')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setProducts((data ?? []) as ChemicalProduct[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setName(''); setManufacturer(''); setEpa(''); setActiveIngredient('');
    setProductType('herbicide'); setDefaultRate(0); setRateUnit('oz_per_gal');
    setReiHours(0); setSdsUrl(''); setNotes('');
    setSheetOpen(true);
  }
  function openEdit(p: ChemicalProduct) {
    setEditing(p);
    setName(p.name);
    setManufacturer(p.manufacturer ?? '');
    setEpa(p.epa_registration_number ?? '');
    setActiveIngredient(p.active_ingredient ?? '');
    setProductType((p.product_type ?? 'other') as ChemicalProductType);
    setDefaultRate(Number(p.default_rate ?? 0));
    setRateUnit(p.rate_unit ?? 'oz_per_gal');
    setReiHours(Number(p.reentry_interval_hours ?? 0));
    setSdsUrl(p.sds_url ?? '');
    setNotes(p.notes ?? '');
    setSheetOpen(true);
  }

  async function save() {
    if (!name.trim()) { toast.error('Name is required.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      : { data: null };
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) { setSaving(false); toast.error('No company.'); return; }

    const payload = {
      company_id: companyId,
      name: name.trim(),
      manufacturer: manufacturer.trim() || null,
      epa_registration_number: epa.trim() || null,
      active_ingredient: activeIngredient.trim() || null,
      product_type: productType,
      default_rate: defaultRate || null,
      rate_unit: rateUnit.trim() || 'oz_per_gal',
      reentry_interval_hours: reiHours,
      sds_url: sdsUrl.trim() || null,
      notes: notes.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('chemical_products').update(payload).eq('id', editing.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Chemical updated.');
    } else {
      const { error } = await supabase.from('chemical_products').insert(payload);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Chemical added.');
    }
    setSheetOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(p: ChemicalProduct) {
    // Soft-delete: archive rather than hard-delete so application history
    // (chemical_applications.product_id) keeps working.
    const { error } = await supabase
      .from('chemical_products')
      .update({ is_active: false })
      .eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    toast.success('Chemical archived.');
  }

  return (
    <div>
      <PageHeader title="Chemicals" description="Pesticide & fertilizer catalog — required for legal application records.">
        <Button
          onClick={openCreate}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Chemical
        </Button>
      </PageHeader>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No chemicals yet"
          description="Add the products you apply (herbicides, fertilizers, etc.) so applications can be logged for compliance."
          action={{ label: '+ Add Chemical', onClick: openCreate }}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">EPA #</th>
                <th className="text-right px-4 py-2.5 font-semibold">Rate</th>
                <th className="text-right px-4 py-2.5 font-semibold">REI hrs</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{p.name}</p>
                    {p.manufacturer && (
                      <p className="text-[11px] text-muted-foreground">{p.manufacturer}</p>
                    )}
                    {p.active_ingredient && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {p.active_ingredient}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.product_type && (
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TYPE_COLORS[p.product_type])}>
                        {TYPE_LABELS[p.product_type]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.epa_registration_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.default_rate ? `${p.default_rate} ${p.rate_unit?.replace('_', ' ')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.reentry_interval_hours ? `${p.reentry_interval_hours}h` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDelete(p)}
                        title="Archive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setEditing(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit chemical' : 'Add chemical'}</SheetTitle>
            <SheetDescription>
              Catalog entry — used when logging applications and on state-compliance PDFs.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Manufacturer</Label>
                <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EPA registration #</Label>
                <Input value={epa} onChange={(e) => setEpa(e.target.value)} className="h-9 text-sm font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active ingredient</Label>
              <Input value={activeIngredient} onChange={(e) => setActiveIngredient(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={productType} onValueChange={(v) => setProductType((v ?? 'other') as ChemicalProductType)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as ChemicalProductType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">REI hours</Label>
                <Input
                  type="number" min={0} step={1}
                  value={reiHours}
                  onChange={(e) => setReiHours(parseInt(e.target.value) || 0)}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Default rate</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rate unit</Label>
                <Input
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value)}
                  placeholder="oz_per_gal"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SDS URL (optional)</Label>
              <Input value={sdsUrl} onChange={(e) => setSdsUrl(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button
              onClick={save}
              disabled={saving || !name.trim()}
              className="w-full"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add chemical'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Archive "${confirmDelete?.name ?? ''}"?`}
        description="The chemical is hidden from the catalog. Existing application history is preserved."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}
