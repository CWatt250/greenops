export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { TemplatesManager, type TemplateRow } from '@/components/jobs/templates-manager';

/**
 * Every saved job template in one place. Templates are created from a job
 * ("Save this job as a template") and used from + New Job; this screen is
 * where the office renames, edits defaults, or deletes them.
 */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('job_templates')
    .select('id, name, title, notes, customer_notes, estimated_duration_minutes, time_window_start, time_window_end, default_line_items, times_used, last_used_at, created_at, client:clients(id, name), service:services(name), crew:crews!job_templates_default_crew_id_fkey(name)')
    .order('times_used', { ascending: false })
    .order('name')
    .limit(500);

  return (
    <div>
      <PageHeader title="Job Templates" description="Reusable job setups per client — one tap to a scheduled job" />
      <PageIntro
        id="templates"
        title="Build it once, schedule it forever"
        description="A template remembers the services, notes, duration, and time window for a property. Use it from + New Job or the client page."
        steps={[
          'Save any job as a template from its detail page.',
          'Rename or fix the defaults here; deleting a template never touches past jobs.',
          '"Most used" floats to the top so the weekly regulars are one click away.',
        ]}
      />
      <TemplatesManager initial={(data ?? []) as unknown as TemplateRow[]} />
    </div>
  );
}
