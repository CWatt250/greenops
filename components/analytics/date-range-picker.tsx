'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { localDateStr } from '@/lib/dates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Preset = '30d' | '90d' | '6m' | '1y' | 'custom';

const PRESETS: { label: string; value: Preset }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'Custom', value: 'custom' },
];

function presetToDates(preset: Preset): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === '30d') from.setDate(to.getDate() - 30);
  else if (preset === '90d') from.setDate(to.getDate() - 90);
  else if (preset === '6m') from.setMonth(to.getMonth() - 6);
  else if (preset === '1y') from.setFullYear(to.getFullYear() - 1);
  return {
    from: localDateStr(from),
    to: localDateStr(to),
  };
}

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const presetParam = (searchParams.get('preset') ?? '90d') as Preset;

  function applyPreset(preset: Preset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('preset', preset);
    if (preset !== 'custom') {
      const { from, to } = presetToDates(preset);
      params.set('from', from);
      params.set('to', to);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustom(field: 'from' | 'to', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('preset', 'custom');
    params.set(field, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => applyPreset(p.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            presetParam === p.value
              ? 'text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
          style={presetParam === p.value ? { backgroundColor: '#3D6B2C' } : {}}
        >
          {p.label}
        </button>
      ))}
      {presetParam === 'custom' && (
        <div className="flex items-center gap-2 ml-1">
          <Label className="text-xs text-muted-foreground shrink-0">From</Label>
          <Input
            type="date"
            value={fromParam ?? ''}
            onChange={(e) => applyCustom('from', e.target.value)}
            className="h-7 text-xs w-36"
          />
          <Label className="text-xs text-muted-foreground shrink-0">To</Label>
          <Input
            type="date"
            value={toParam ?? ''}
            onChange={(e) => applyCustom('to', e.target.value)}
            className="h-7 text-xs w-36"
          />
        </div>
      )}
    </div>
  );
}

export function getDateRange(searchParams: URLSearchParams): { from: string; to: string } {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const preset = (searchParams.get('preset') ?? '90d') as Preset;
  if (from && to) return { from, to };
  return presetToDates(preset);
}
