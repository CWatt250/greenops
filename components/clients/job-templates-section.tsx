'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ClipboardList, Plus, Clock, RotateCcw, Loader2 } from 'lucide-react';
import type { JobTemplate } from '@/types';

interface Props {
  clientId: string;
  clientName: string;
}

function formatDuration(mins: number | null | undefined): string {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function templatePriceLabel(t: JobTemplate): string | null {
  const items = Array.isArray(t.default_line_items) ? t.default_line_items : [];
  if (items.length === 0) return null;
  const total = items.reduce((sum, li) => sum + (li.unit_price * li.quantity), 0);
  if (total <= 0) return null;
  return `$${total.toFixed(0)}`;
}

export function JobTemplatesSection({ clientId, clientName }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<JobTemplate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('job_templates')
        .select('*')
        .eq('client_id', clientId)
        .order('times_used', { ascending: false })
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      setTemplates((data ?? []) as JobTemplate[]);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (templates === null) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Saved Jobs for This Property
        </h2>
        <Link
          href={`/dashboard/jobs/new?client_id=${clientId}&save_as_template=1`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No saved templates yet. Check &ldquo;Save as template for {clientName}&rdquo; when
          creating a job to reuse its setup later.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => {
            const priceLabel = templatePriceLabel(t);
            return (
              <li key={t.id} className="rounded-lg border bg-background p-3 flex flex-col gap-2">
                <Link
                  href={`/dashboard/clients/${clientId}/templates/${t.id}`}
                  className="text-sm font-semibold leading-tight hover:underline truncate"
                  title="Edit template"
                >
                  {t.name}
                </Link>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatDuration(t.estimated_duration_minutes)}
                  </span>
                  {priceLabel && <span>· {priceLabel}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <RotateCcw className="h-3 w-3" />
                  <span>Used {t.times_used} time{t.times_used === 1 ? '' : 's'}</span>
                </div>
                <Link
                  href={`/dashboard/jobs/new?client_id=${clientId}&template_id=${t.id}`}
                  className="mt-1"
                >
                  <Button
                    size="sm"
                    className="w-full h-8 gap-1.5"
                    style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Job
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
