'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_SIZE } from '@/lib/list-params';

/**
 * URL-backed list controls. The server page reads `?q=&status=&page=`
 * (lib/list-params.ts) and does the filtering; these components only edit
 * the URL. Shareable, back-button friendly, and immune to the 1,000-row cap.
 */
function useListNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '' || v === 'all' || (k === 'page' && v === '1')) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { sp, set, pending };
}

export function ListSearch({ placeholder, className }: { placeholder: string; className?: string }) {
  const { sp, set, pending } = useListNav();
  const [value, setValue] = useState(sp.get('q') ?? '');
  // `set` closes over the current URL, so keep the latest copy in a ref
  // (updated after render) and let the debounce effect depend on `value` only.
  const setRef = useRef(set);
  useEffect(() => {
    setRef.current = set;
  });
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => setRef.current({ q: value.trim(), page: null }), 300);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        className="pl-9 pr-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={placeholder}
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function StatusPills({
  options,
  activeColor,
  counts,
  className,
}: {
  options: ReadonlyArray<{ label: string; value: string }>;
  /** CSS color for the active pill (e.g. 'var(--orange)'). */
  activeColor: string;
  counts?: Record<string, number>;
  className?: string;
}) {
  const { sp, set } = useListNav();
  const active = sp.get('status') ?? 'all';
  return (
    <div className={cn('flex gap-2 flex-wrap', className)}>
      {options.map(({ label, value }) => {
        const isActive = active === value;
        const count = counts?.[value];
        return (
          <button
            key={value}
            type="button"
            onClick={() => set({ status: value, page: null })}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
            style={isActive ? { backgroundColor: activeColor } : undefined}
          >
            {label}
            {count != null && count > 0 && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums', isActive ? 'bg-white/20' : 'bg-background')}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ListPager({
  page,
  total,
  label,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  label: string;
  pageSize?: number;
}) {
  const { set, pending } = useListNav();
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-6 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <p className="tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {label}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1 || pending} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 tabular-nums">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages || pending} onClick={() => set({ page: String(page + 1) })} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
