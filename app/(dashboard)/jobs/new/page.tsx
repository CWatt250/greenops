export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JobForm } from '@/components/jobs/job-form';
import { PageHeader } from '@/components/shared/page-header';
import type { Crew } from '@/types';

export default async function NewJobPage() {
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

  const { data: crews } = await supabase
    .from('crews')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return (
    <div>
      <PageHeader title="New Job" description="Create a new job" />
      <JobForm companyId={profile.company_id} crews={(crews ?? []) as Crew[]} />
    </div>
  );
}
