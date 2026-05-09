'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Props {
  companyId: string;
  initialOverheadPct: number;
}

export function OverheadForm({ companyId, initialOverheadPct }: Props) {
  const supabase = createClient();
  const [pct, setPct] = useState<number>(initialOverheadPct);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ overhead_pct: pct })
      .eq('id', companyId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Overhead set to ${pct}%.`);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Add overhead percentage to cover business costs not tied to specific
        jobs (insurance, office, vehicles, etc.). Applied automatically to
        every job's actual cost.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <Label htmlFor="overhead-pct" className="text-xs">Overhead %</Label>
          <div className="relative">
            <Input
              id="overhead-pct"
              type="number"
              step={0.5}
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(parseFloat(e.target.value) || 0)}
              className="h-9 w-28 pr-6 text-sm tabular-nums"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="gap-1.5"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
