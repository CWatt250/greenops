'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { JobCard } from '@/components/jobs/job-card';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Plus, Briefcase } from 'lucide-react';
import type { Job, JobStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusFilters: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Complete', value: 'complete' },
  { label: 'Issue', value: 'issue' },
];

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from('jobs')
        .select('*, client:clients(name), crew:crews(name)')
        .order('scheduled_date', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data } = await query;
      setJobs((data ?? []) as Job[]);
      setLoading(false);
    }
    load();
  }, [statusFilter]);

  return (
    <div>
      <PageHeader title="Jobs" description="Track and manage all jobs">
        <Link
          href="/dashboard/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
      </PageHeader>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        {statusFilters.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              statusFilter === value
                ? 'text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            style={
              statusFilter === value
                ? { backgroundColor: 'var(--color-brand-green-raw)' }
                : {}
            }
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs found"
          description="Create your first job to get started."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
