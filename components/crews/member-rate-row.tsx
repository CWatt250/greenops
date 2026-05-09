'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { CrewMember, Profile } from '@/types';

interface Props {
  member: CrewMember & { profile: Profile | null };
}

/**
 * Inline rate editor — renders the member's avatar/name and two
 * editable fields (hourly rate + labor burden). Saves on blur via
 * Supabase update; toasts the result.
 */
export function MemberRateRow({ member }: Props) {
  const supabase = createClient();
  const [rate, setRate] = useState<number>(Number(member.hourly_rate ?? 25));
  const [burden, setBurden] = useState<number>(Number(member.labor_burden_pct ?? 25));
  const [savingField, setSavingField] = useState<string | null>(null);

  async function persist(patch: { hourly_rate?: number; labor_burden_pct?: number }, field: string) {
    setSavingField(field);
    const { error } = await supabase
      .from('crew_members')
      .update(patch)
      .eq('id', member.id);
    setSavingField(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Rate updated.');
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
        {(member.profile?.full_name ?? '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {member.profile?.full_name ?? 'Unknown'}
        </p>
        <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
      </div>
      <div className="flex items-end gap-2 shrink-0">
        <div className="text-right">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground block">
            Rate
          </Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              $
            </span>
            <Input
              type="number"
              step={0.5}
              min={0}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              onBlur={() => {
                if (rate !== Number(member.hourly_rate ?? 25)) {
                  void persist({ hourly_rate: rate }, 'rate');
                }
              }}
              className="h-7 w-20 pl-5 pr-1 text-xs tabular-nums"
              disabled={savingField === 'rate'}
            />
          </div>
        </div>
        <div className="text-right">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground block">
            Burden
          </Label>
          <div className="relative">
            <Input
              type="number"
              step={1}
              min={0}
              value={burden}
              onChange={(e) => setBurden(parseFloat(e.target.value) || 0)}
              onBlur={() => {
                if (burden !== Number(member.labor_burden_pct ?? 25)) {
                  void persist({ labor_burden_pct: burden }, 'burden');
                }
              }}
              className="h-7 w-16 pr-5 text-xs tabular-nums"
              disabled={savingField === 'burden'}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
