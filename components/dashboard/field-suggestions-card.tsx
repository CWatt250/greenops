'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ruler, ChevronRight, Loader2, Archive, FileEdit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { LiveIndicator } from '@/components/shared/live-indicator';
import { toast } from 'sonner';

interface SuggestionRow {
  id: string;
  client_id: string | null;
  field_note: string | null;
  total_turf_sqft: number;
  total_hardscape_sqft: number;
  total_bed_sqft: number;
  submitted_to_office_at: string | null;
  submitted_by: { full_name: string | null } | null;
  client: { id: string; name: string; service_address: string | null } | null;
}

interface Props {
  companyId: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Surfaces field-submitted measurements ("crew thinks the customer
 * needs a quote on this") so the office can pick them up. Lives on the
 * dashboard alongside Portal Inbox.
 */
export function FieldSuggestionsCard({ companyId }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<SuggestionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('property_measurements')
      .select(
        'id, client_id, field_note, total_turf_sqft, total_hardscape_sqft, total_bed_sqft, ' +
        'submitted_to_office_at, ' +
        'submitted_by:profiles!submitted_by_profile_id(full_name), ' +
        'client:clients(id,name,service_address)',
      )
      .eq('company_id', companyId)
      .eq('status', 'submitted')
      .order('submitted_to_office_at', { ascending: false })
      .limit(6);
    setItems(((data ?? []) as unknown) as SuggestionRow[]);
  }, [companyId, supabase]);

  // Re-fetch when row status changes (crew submits another, admin
  // archives one), and poll every 30s as a safety net.
  const { status, updatedAt } = useLiveData({
    channelKey: companyId ? `field-suggestions-${companyId}` : 'field-suggestions',
    tables: companyId
      ? [{ table: 'property_measurements', filter: `company_id=eq.${companyId}` }]
      : [],
    loader: load,
    enabled: !!companyId,
  });

  useEffect(() => { load(); }, [load]);

  async function archive(id: string) {
    setBusy(id);
    const { error } = await supabase
      .from('property_measurements')
      .update({ status: 'archived' })
      .eq('id', id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Suggestion archived.');
    load();
  }

  function convertToProposal(row: SuggestionRow) {
    if (!row.client_id) {
      // Standalone measurement — proposal builder will let the user pick
      // an existing client or create a new one.
      router.push(`/dashboard/proposals/new?measurement_id=${row.id}`);
      return;
    }
    router.push(`/dashboard/proposals/new?client_id=${row.client_id}&measurement_id=${row.id}`);
  }

  if (!companyId) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4" style={{ color: 'var(--orange)' }} />
          <h2
            className="text-base uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
          >
            Field suggestions
          </h2>
        </div>
        <LiveIndicator status={status} updatedAt={updatedAt} />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 px-4 italic">
          No new field measurements waiting. When a crew sends one in, it shows up here.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((row) => {
            const totalSqft = (row.total_turf_sqft ?? 0)
              + (row.total_hardscape_sqft ?? 0)
              + (row.total_bed_sqft ?? 0);
            return (
              <li key={row.id} className="px-5 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {row.client?.name ?? 'Field measurement'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.client?.service_address ?? 'No address recorded'}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {Math.round(totalSqft).toLocaleString()} sf · turf {Math.round(row.total_turf_sqft ?? 0).toLocaleString()} sf
                      {row.submitted_by?.full_name ? ` · by ${row.submitted_by.full_name}` : ''}
                      {row.submitted_to_office_at ? ` · ${relTime(row.submitted_to_office_at)}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/measure?measurement_id=${row.id}`}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="View measurement"
                    title="Open measurement"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
                {row.field_note && (
                  <p className="text-xs italic text-muted-foreground border-l-2 pl-2 ml-0.5"
                    style={{ borderLeftColor: 'var(--orange)' }}>
                    &ldquo;{row.field_note}&rdquo;
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => convertToProposal(row)}
                    disabled={busy !== null}
                    className="gap-1.5 text-white"
                    style={{ backgroundColor: 'var(--orange)' }}
                  >
                    <FileEdit className="h-3.5 w-3.5" />
                    Generate proposal
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => archive(row.id)}
                    disabled={busy === row.id}
                    className="gap-1.5"
                  >
                    {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                    Archive
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
