'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { JobCard } from '@/components/jobs/job-card';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus, Briefcase, Loader2, X, ChevronDown, UserMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Job, JobStatus, Crew } from '@/types';

const statusFilters: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Complete', value: 'complete' },
  { label: 'Issue', value: 'issue' },
];

export default function JobsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Only the columns JobCard + the bulk-action bar render, not the whole row.
      let query = supabase
        .from('jobs')
        .select('id, title, status, scheduled_date, scheduled_start, crew_id, client:clients(name), crew:crews(id,name,color)')
        .order('scheduled_date', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const [{ data }, { data: crewList }] = await Promise.all([
        query,
        supabase.from('crews').select('*').eq('is_active', true).order('name'),
      ]);
      setJobs((data ?? []) as unknown as Job[]);
      setCrews((crewList ?? []) as Crew[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function toggleSelect(id: string, on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Apply local crew change to in-memory state so the card reflects immediately
  // without a full reload.
  function applyLocalCrewChange(jobId: string, newCrewId: string | null) {
    const newCrew = newCrewId ? crews.find((c) => c.id === newCrewId) ?? null : null;
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              crew_id: newCrewId ?? undefined,
              crew: newCrew
                ? { id: newCrew.id, name: newCrew.name, color: newCrew.color } as unknown as Crew
                : undefined,
            }
          : j
      )
    );
  }

  async function bulkAssign(targetCrewId: string | null, label: string) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkOpen(false);

    const ids = Array.from(selectedIds);
    const patch: Record<string, unknown> = { crew_id: targetCrewId };
    if (targetCrewId === null) patch.status = 'unscheduled';

    const { error } = await supabase.from('jobs').update(patch).in('id', ids);
    setBulkBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Update in-memory state for each affected job
    for (const id of ids) applyLocalCrewChange(id, targetCrewId);
    toast.success(`${ids.length} job${ids.length === 1 ? '' : 's'} reassigned to ${label}.`);
    clearSelection();
  }

  const selected = useMemo(
    () => jobs.filter((j) => selectedIds.has(j.id)),
    [jobs, selectedIds]
  );

  return (
    <div>
      <PageHeader title="Jobs" description="Track and manage all jobs">
        <Link
          href="/dashboard/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
      </PageHeader>

      <PageIntro
        id="jobs"
        title="Every job in one list"
        description="Filter by status, search by client or title, and select multiple to bulk-reassign or invoice."
        steps={[
          'Use the status pills to narrow to scheduled, in-progress, complete, or issue.',
          'Tap the checkbox column to multi-select and reveal bulk actions.',
          'Click a job row to see line items, costing, forms, and the activity log.',
        ]}
      />

      <div className="flex gap-2 flex-wrap mb-4">
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
            style={statusFilter === value ? { backgroundColor: 'var(--orange)' } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div
          className="sticky top-14 z-30 mb-4 flex items-center gap-3 rounded-xl border bg-background/95 backdrop-blur-sm shadow-md px-4 py-2.5"
        >
          <span className="text-sm font-semibold">
            {selected.length} selected
          </span>
          <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1 text-xs font-semibold hover:border-foreground/40"
              disabled={bulkBusy}
            >
              {bulkBusy
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ChevronDown className="h-3 w-3" />}
              Reassign to…
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-56 p-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Bulk reassign
              </p>
              <ul className="space-y-0.5">
                {crews.map((crew) => (
                  <li key={crew.id}>
                    <button
                      type="button"
                      onClick={() => bulkAssign(crew.id, crew.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: crew.color }}
                      />
                      <span className="flex-1 truncate">{crew.name}</span>
                    </button>
                  </li>
                ))}
                <li className="border-t mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => bulkAssign(null, 'Unassigned')}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60"
                  >
                    <UserMinus className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1">Unassigned</span>
                  </button>
                </li>
              </ul>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="ml-auto gap-1.5"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Loading…</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={statusFilter === 'all' ? 'No jobs yet' : `No ${statusFilter.replace('_', ' ')} jobs`}
          description={
            statusFilter === 'all'
              ? 'A job is a unit of work for one client on one date. Create one to drop it onto the schedule and assign a crew.'
              : 'Try a different status filter or create a new job.'
          }
          action={{
            label: '+ Create your first job',
            onClick: () => router.push('/dashboard/jobs/new'),
          }}
          secondaryAction={statusFilter === 'all' ? {
            label: 'Learn more about jobs →',
            onClick: () => window.open('https://tlclandscapemanagement.com/learn', '_blank'),
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              crews={crews}
              selectable
              selected={selectedIds.has(job.id)}
              onSelectChange={(on) => toggleSelect(job.id, on)}
              onCrewChange={(newCrewId) => applyLocalCrewChange(job.id, newCrewId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
