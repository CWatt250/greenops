'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localDateStr } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { JobHistoryCard, type JobPhoto } from '@/components/portal/job-history-card';
import { LiveIndicator } from '@/components/shared/live-indicator';
import { useLiveData } from '@/lib/hooks/use-live-data';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

type Filter = 'all' | 'upcoming' | 'past';
type JobRow = Job & { crew?: { name: string; color: string } | null };

export default function PortalJobsPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [photosByJob, setPhotosByJob] = useState<Record<string, JobPhoto[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Resolve the customer's client_id once. Every subsequent query is scoped
  // to it (and matches the new portal RLS policy from migration 026).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase
        .from('portal_users')
        .select('client_id')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      setClientId((pu as { client_id?: string } | null)?.client_id ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJobs = useCallback(async () => {
    if (!clientId) return;
    const { data: jobRows } = await supabase
      .from('jobs')
      .select(
        '*, crew:crews(name, color)',
      )
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false });

    const list = (jobRows ?? []) as JobRow[];
    setJobs(list);

    // Pull job_photos in a single follow-up query so the in-memory join
    // by job_id is cheap. The new RLS lets portal users read photos for
    // jobs that belong to their client.
    const completedIds = list
      .filter((j) => j.status === 'complete')
      .map((j) => j.id);
    if (completedIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('job_photos')
        .select('id, job_id, storage_path, caption')
        .in('job_id', completedIds);
      const grouped: Record<string, JobPhoto[]> = {};
      for (const row of (photoRows ?? []) as Array<{ id: string; job_id: string; storage_path: string; caption: string | null }>) {
        const url = supabase.storage.from('job-photos').getPublicUrl(row.storage_path).data.publicUrl;
        (grouped[row.job_id] ??= []).push({ id: row.id, url, caption: row.caption });
      }
      setPhotosByJob(grouped);
    } else {
      setPhotosByJob({});
    }

    setLoading(false);
  }, [clientId, supabase]);

  const { status, updatedAt } = useLiveData({
    channelKey: clientId ? `portal-jobs-${clientId}` : 'portal-jobs',
    tables: clientId
      ? [{ table: 'jobs', filter: `client_id=eq.${clientId}` }]
      : [],
    loader: loadJobs,
    enabled: !!clientId,
  });

  const today = localDateStr();
  const filtered = useMemo(() => jobs.filter((j) => {
    if (filter === 'upcoming') return j.scheduled_date && j.scheduled_date >= today && j.status !== 'cancelled';
    if (filter === 'past') return !j.scheduled_date || j.scheduled_date < today || j.status === 'complete' || j.status === 'cancelled';
    return true;
  }), [jobs, filter, today]);

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Job History</h1>
        <LiveIndicator status={status} updatedAt={updatedAt} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'upcoming', 'past'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              filter === f ? 'text-white' : 'bg-white border border-gray-200 text-gray-600',
            )}
            style={filter === f ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">🌿</p>
          <p className="text-sm font-medium text-gray-600">No jobs yet</p>
          <Link
            href="/portal/requests/new"
            className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
            style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
          >
            Request Your First Service
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobHistoryCard
              key={job.id}
              job={job}
              photos={photosByJob[job.id] ?? []}
              isUpcoming={!!job.scheduled_date && job.scheduled_date >= today && job.status !== 'cancelled'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
