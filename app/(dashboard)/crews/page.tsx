'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Plus, UsersRound, ChevronDown, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Crew, CrewMember, Profile } from '@/types';
import { cn } from '@/lib/utils';

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrewFormData>({ resolver: zodResolver(crewSchema) });

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('crews')
      .select('*, crew_members(*, profile:profiles(*))')
      .eq('is_active', true)
      .order('name');
    setCrews((data ?? []) as CrewWithMembers[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function onSubmit(data: CrewFormData) {
    setServerError(null);
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
    reset();
    setSheetOpen(false);
    load();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <PageHeader title="Crews" description="Manage your field teams">
        <Button
          onClick={() => setSheetOpen(true)}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
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
          action={{ label: '+ New Crew', onClick: () => setSheetOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crews.map((crew) => (
            <div key={crew.id} className="rounded-xl border bg-card overflow-hidden">
              <button
                onClick={() => toggleExpand(crew.id)}
                className="w-full flex items-center gap-3 p-5 text-left hover:bg-muted/30 transition-colors"
              >
                <div
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ backgroundColor: crew.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{crew.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {crew.crew_members.length} member{crew.crew_members.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {expanded[crew.id]
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>

              {expanded[crew.id] && crew.crew_members.length > 0 && (
                <div className="border-t divide-y">
                  {crew.crew_members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                        {(member.profile?.full_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{member.profile?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                      </div>
                    </div>
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Crew</SheetTitle>
            <SheetDescription>Create a new field crew.</SheetDescription>
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
                <Input id="crew-color" type="color" className="h-10 w-14 p-1" defaultValue="#3D6B2C" {...register('color')} />
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
              style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            >
              {isSubmitting ? 'Creating…' : 'Create Crew'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
