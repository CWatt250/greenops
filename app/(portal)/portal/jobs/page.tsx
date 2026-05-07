'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JobHistoryCard } from '@/components/portal/job-history-card';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

type Filter = 'all' | 'upcoming' | 'past';

export default function PortalJobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<(Job & { crew?: { name: string; color: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: pu } = await supabase.from('portal_users').select('client_id').eq('id', user.id).single();
      if (!pu) { setLoading(false); return; }

      const { data } = await supabase
        .from('jobs')
        .select('*, crew:crews(name, color)')
        .eq('client_id', pu.client_id)
        .order('scheduled_date', { ascending: false });

      setJobs((data ?? []) as (Job & { crew?: { name: string; color: string } | null })[]);
      setLoading(false);
    }
    load();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const filtered = jobs.filter((j) => {
    if (filter === 'upcoming') return j.scheduled_date && j.scheduled_date >= today && j.status !== 'cancelled';
    if (filter === 'past') return !j.scheduled_date || j.scheduled_date < today || j.status === 'complete' || j.status === 'cancelled';
    return true;
  });

  return (
    <div className="px-4 py-5 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Job History</h1>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'upcoming', 'past'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              filter === f ? 'text-white' : 'bg-white border border-gray-200 text-gray-600'
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
              isUpcoming={!!job.scheduled_date && job.scheduled_date >= today && job.status !== 'cancelled'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
