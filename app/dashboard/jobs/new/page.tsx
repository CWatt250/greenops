export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { JobForm } from '@/components/jobs/job-form';
import { PageHeader } from '@/components/shared/page-header';
import { templateToJobDraft } from '@/lib/job-templates';
import { Lightbulb } from 'lucide-react';
import type { Crew, JobTemplate, JobLineItem } from '@/types';

interface Props {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{
    client_id?: string;
    template_id?: string;
  }>;
}

export default async function NewJobPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const clientIdParam = sp.client_id ?? null;
  const templateIdParam = sp.template_id ?? null;

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

  // Load the template (when ?template_id=...) and the client's other
  // templates (so we can show the "💡 has N templates" banner when no
  // template_id was picked).
  let template: JobTemplate | null = null;
  let clientName: string | null = null;
  let otherTemplates: JobTemplate[] = [];

  if (templateIdParam) {
    const { data } = await supabase
      .from('job_templates')
      .select('*')
      .eq('id', templateIdParam)
      .single();
    template = (data as JobTemplate | null) ?? null;
  }

  const effectiveClientId = template?.client_id ?? clientIdParam;

  if (effectiveClientId) {
    const [clientRes, tplsRes] = await Promise.all([
      supabase.from('clients').select('name').eq('id', effectiveClientId).single(),
      supabase
        .from('job_templates')
        .select('*')
        .eq('client_id', effectiveClientId)
        .order('times_used', { ascending: false })
        .limit(10),
    ]);
    clientName = (clientRes.data?.name as string | undefined) ?? null;
    otherTemplates = ((tplsRes.data ?? []) as JobTemplate[])
      .filter((t) => t.id !== templateIdParam);
  }

  // Build the initial form values from the template (when picked).
  const draft = template ? templateToJobDraft(template) : null;
  const initialData = template
    ? {
        client_id: template.client_id,
        title: draft!.title,
        notes: draft!.notes,
        customer_notes: draft!.customer_notes,
        estimated_duration_minutes: draft!.estimated_duration_minutes ?? undefined,
        time_window_start: draft!.time_window_start ?? undefined,
        time_window_end: draft!.time_window_end ?? undefined,
        crew_id: draft!.default_crew_id ?? undefined,
      }
    : clientIdParam
      ? { client_id: clientIdParam }
      : undefined;

  const initialLineItems: JobLineItem[] = draft
    ? draft.line_items.map((li, i) => ({
        id: '', // unsaved drafts
        job_id: '',
        service_id: li.service_id ?? undefined,
        description: li.description ?? '',
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.quantity * li.unit_price,
        created_at: new Date().toISOString(),
        // intentionally drop a synthetic key so JobForm treats these as unsaved
      } as unknown as JobLineItem))
    : [];

  return (
    <div>
      <PageHeader
        title={template ? `New Job from "${template.name}"` : 'New Job'}
        description={template
          ? `Pre-filled from a saved template for ${clientName ?? 'this client'}. Adjust anything before saving.`
          : 'Create a new job'}
      />

      {/* Template chips banner — only when client has templates AND we
       *  haven't already pinned one. */}
      {!template && effectiveClientId && otherTemplates.length > 0 && (
        <div className="rounded-md border bg-amber-50 border-amber-200 px-4 py-3 mb-5 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-amber-900">
            <Lightbulb className="h-4 w-4" />
            {clientName ?? 'This property'} has {otherTemplates.length} saved template{otherTemplates.length === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {otherTemplates.map((t) => (
              <Link
                key={t.id}
                href={`/dashboard/jobs/new?client_id=${effectiveClientId}&template_id=${t.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
              >
                {t.name}
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-amber-800 mt-2">
            Tap one to start with that template's details.
          </p>
        </div>
      )}

      <JobForm
        companyId={profile.company_id}
        crews={(crews ?? []) as Crew[]}
        initialData={initialData}
        initialLineItems={initialLineItems}
        spawnedFromTemplateId={template?.id}
        clientName={clientName ?? undefined}
      />
    </div>
  );
}
