'use client';

import { useState, useEffect } from 'react';
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
import { Plus, UsersRound, ChevronDown, ChevronRight, Pencil, PowerOff } from 'lucide-react';
import { MemberRateRow } from '@/components/crews/member-rate-row';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { Crew, CrewMember, Profile } from '@/types';

const crewSchema = z.object({
  name: z.string().min(1, 'Crew name is required'),
  color: z.string(),
});
type CrewFormData = z.infer<typeof crewSchema>;

type CrewWithMembers = Crew & {
  crew_members: (CrewMember & { profile: Profile | null })[];
};

export default function CrewsPage() {
  const supabase = createClient();
  const [crews, setCrews] = useState<CrewWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<CrewWithMembers | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrewFormData>({
    resolver: zodResolver(crewSchema),
    defaultValues: { name: '', color: '#F15A24' },
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('crews')
      .select('*, crew_members(*, hourly_rate, labor_burden_pct, profile:profiles(*))')
      .eq('is_active', true)
      .order('name');
    setCrews((data ?? []) as CrewWithMembers[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setServerError(null);
    reset({ name: '', color: '#F15A24' });
    setSheetOpen(true);
  }

  function openEdit(crew: CrewWithMembers) {
    setEditingId(crew.id);
    setServerError(null);
    reset({ name: crew.name, color: crew.color });
    setSheetOpen(true);
  }

  async function onSubmit(data: CrewFormData) {
    setServerError(null);

    if (editingId) {
      const { error } = await supabase
        .from('crews')
        .update(data)
        .eq('id', editingId);
      if (error) { setServerError(error.message); return; }
      toast.success('Crew updated.');
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single();
      if (!profile?.company_id) { setServerError('No company found'); return; }

      const { error } = await supabase.from('crews').insert({
        ...data,
        company_id: profile.company_id,
      });
      if (error) { setServerError(error.message); return; }
      toast.success('Crew created.');
    }

    setSheetOpen(false);
    setEditingId(null);
    load();
  }

  async function handleDeactivate(crew: CrewWithMembers) {
    // Refuse if there are still scheduled / in-progress jobs assigned.
    const { count } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('crew_id', crew.id)
      .in('status', ['scheduled', 'in_progress', 'unscheduled']);

    if (count && count > 0) {
      toast.error(`${count} job${count === 1 ? '' : 's'} still assigned to this crew. Reassign or complete them first.`);
      return;
    }

    const { error } = await supabase
      .from('crews')
      .update({ is_active: false })
      .eq('id', crew.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Crew deactivated.');
    setCrews((prev) => prev.filter((c) => c.id !== crew.id));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <PageHeader title="Crews" description="Manage your field teams">
        <Button
          onClick={openCreate}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Crew
        </Button>
      </PageHeader>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : crews.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No crews yet"
          description="Create your first crew to start scheduling jobs."
          action={{ label: '+ New Crew', onClick: openCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crews.map((crew) => (
            <div key={crew.id} className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 p-5">
                <button
                  onClick={() => toggleExpand(crew.id)}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  <div
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: crew.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{crew.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {crew.crew_members.length} member{crew.crew_members.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {expanded[crew.id]
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(crew)}
                    aria-label="Edit crew"
                    title="Edit crew"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeactivate(crew)}
                    aria-label="Deactivate crew"
                    title="Deactivate crew"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {expanded[crew.id] && crew.crew_members.length > 0 && (
                <div className="border-t divide-y">
                  {crew.crew_members.map((member) => (
                    <MemberRateRow key={member.id} member={member} />
                  ))}
                </div>
              )}

              {expanded[crew.id] && crew.crew_members.length === 0 && (
                <div className="border-t px-5 py-4">
                  <p className="text-xs text-muted-foreground text-center">No members assigned.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setEditingId(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit Crew' : 'New Crew'}</SheetTitle>
            <SheetDescription>
              {editingId ? 'Update this crew’s details.' : 'Create a new field crew.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="crew-name">Crew Name *</Label>
              <Input id="crew-name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="crew-color">Color</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="crew-color"
                  type="color"
                  className="h-10 w-14 p-1"
                  {...register('color')}
                />
                <span className="text-sm text-muted-foreground">Pick a crew color</span>
              </div>
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
              {isSubmitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Crew'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDeactivate}
        onOpenChange={(o) => { if (!o) setConfirmDeactivate(null); }}
        title={`Deactivate "${confirmDeactivate?.name ?? ''}"?`}
        description="This crew is hidden from the app, but historical jobs and routes still reference it. You can't deactivate a crew with active jobs assigned."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (confirmDeactivate) await handleDeactivate(confirmDeactivate);
        }}
      />
    </div>
  );
}
