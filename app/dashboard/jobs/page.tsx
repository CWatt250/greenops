export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { JobsView } from '@/components/jobs/jobs-view';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Job, Crew } from '@/types';

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Server-side fetch via the cookie-based SSR client: RLS scopes rows to the
  // user's company. Jobs use idx_jobs_* on the company scope; crews use
  // idx_crews_company_id. Only the columns JobCard + the bulk bar render.
  const [{ data: jobsData }, { data: crewData }] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title, status, scheduled_date, scheduled_start, crew_id, client:clients(name), crew:crews(id,name,color)')
      .order('scheduled_date', { ascending: false }),
    supabase.from('crews').select('*').eq('is_active', true).order('name'),
  ]);

  const jobs = (jobsData ?? []) as unknown as Job[];
  const crews = (crewData ?? []) as Crew[];

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

      <JobsView initialJobs={jobs} initialCrews={crews} />
    </div>
  );
}
