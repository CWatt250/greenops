export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { JobForm } from '@/components/jobs/job-form';
import { PageHeader } from '@/components/shared/page-header';
import type { Crew, Job, JobLineItem } from '@/types';

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) {
    return (
      <div className="text-sm text-muted-foreground p-8">
        No company associated with your account. Contact your administrator.
      </div>
    );
  }

  const [{ data: job }, { data: crews }, { data: lineItems }] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single(),
    supabase.from('crews').select('*').eq('is_active', true).order('name'),
    supabase.from('job_line_items').select('*').eq('job_id', id),
  ]);

  if (!job) notFound();

  return (
    <div>
      <PageHeader title="Edit Job" description={(job as Job).title} />
      <JobForm
        companyId={profile.company_id}
        crews={(crews ?? []) as Crew[]}
        initialData={job as Job}
        initialLineItems={(lineItems ?? []) as JobLineItem[]}
      />
    </div>
  );
}
