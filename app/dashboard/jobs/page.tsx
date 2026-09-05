export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { JobsView } from '@/components/jobs/jobs-view';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Job, JobStatus, Crew } from '@/types';
import { parseListParams, ilikePattern, inList, type SearchParams } from '@/lib/list-params';

const JOB_STATUSES = ['unscheduled', 'scheduled', 'in_progress', 'complete', 'cancelled', 'issue'] as const satisfies readonly JobStatus[];

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = parseListParams(await searchParams, JOB_STATUSES);

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company. Status, search, and paging all happen here so the list
  // stays bounded (PostgREST caps responses at 1,000 rows). Only the columns
  // JobCard + the bulk bar render.
  let jobsQuery = supabase
    .from('jobs')
    .select('id, title, status, scheduled_date, scheduled_start, crew_id, client:clients(name), crew:crews(id,name,color)', { count: 'exact' })
    .order('scheduled_date', { ascending: false })
    .order('id');
  if (params.status !== 'all') jobsQuery = jobsQuery.eq('status', params.status);
  if (params.q) {
    const pattern = ilikePattern(params.q);
    // Client name lives on a joined table; resolve matching ids first so the
    // search covers "Whitmore" as well as "Fall cleanup".
    const { data: matches } = await supabase.from('clients').select('id').ilike('name', pattern).limit(100);
    const ids = inList((matches ?? []).map((c) => c.id));
    jobsQuery = ids ? jobsQuery.or(`title.ilike.${pattern},client_id.in.(${ids})`) : jobsQuery.ilike('title', pattern);
  }

  const [{ data: jobsData, count }, { data: crewData }] = await Promise.all([
    jobsQuery.range(params.from, params.to),
    supabase.from('crews').select('*').eq('is_active', true).order('name'),
  ]);

  const jobs = (jobsData ?? []) as unknown as Job[];
  const crews = (crewData ?? []) as Crew[];
  const total = count ?? jobs.length;

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

      <JobsView
        key={`${params.page}|${params.status}|${params.q}`}
        initialJobs={jobs}
        initialCrews={crews}
        total={total}
        page={params.page}
        status={params.status}
        q={params.q}
      />
    </div>
  );
}
