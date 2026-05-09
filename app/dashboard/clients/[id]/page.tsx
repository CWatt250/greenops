export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils';
import {
  Phone, Mail, MapPin, Edit, Briefcase, ClipboardList, Activity, Ruler,
} from 'lucide-react';
import { InviteToPortalButton } from '@/components/clients/invite-to-portal-button';
import { DeleteClientButton } from '@/components/clients/delete-client-button';
import { ClientFormSubmissionsList } from '@/components/forms/client-form-submissions-list';
import type { Client, Job } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !client) notFound();

  const [jobsRes, portalRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('portal_users').select('id').eq('client_id', id).maybeSingle(),
  ]);

  const c = client as Client;
  const clientJobs = (jobsRes.data ?? []) as Job[];
  const hasPortalUser = !!portalRes.data;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <StatusBadge status={c.status} type="client" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {c.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </span>
            )}
            {c.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {c.email}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {c.service_address}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InviteToPortalButton
            clientId={id}
            clientName={c.name}
            email={c.email ?? ''}
            hasPortalUser={hasPortalUser}
          />
          <Link
            href={`/dashboard/clients/${id}/measure`}
            className={buttonVariants({ variant: 'outline' })}
            title="Measure property"
          >
            <Ruler className="h-4 w-4 mr-1.5" /> Measure Property
          </Link>
          <Link
            href={`/dashboard/clients/${id}/edit`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Link>
          <DeleteClientButton
            clientId={id}
            clientName={c.name}
            jobCount={clientJobs.length}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({clientJobs.length})</TabsTrigger>
          <TabsTrigger value="forms">📋 Forms</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Forms */}
        <TabsContent value="forms">
          <ClientFormSubmissionsList clientId={id} />
        </TabsContent>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Property Info
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Type</dt>
                  <dd className="text-sm font-medium capitalize">{c.property_type}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Service Address</dt>
                  <dd className="text-sm font-medium">
                    {c.service_address}
                    {c.service_city && `, ${c.service_city}`}
                    {c.service_state && ` ${c.service_state}`}
                    {c.service_zip && ` ${c.service_zip}`}
                  </dd>
                </div>
                {c.lot_size_sqft && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Lot Size</dt>
                    <dd className="text-sm font-medium">
                      {c.lot_size_sqft.toLocaleString()} sq ft
                    </dd>
                  </div>
                )}
                {c.access_notes && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Access Notes</dt>
                    <dd className="text-sm">{c.access_notes}</dd>
                  </div>
                )}
                {c.gate_code && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Gate Code</dt>
                    <dd className="text-sm font-mono font-medium">{c.gate_code}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Contact
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Preferred Contact</dt>
                  <dd className="text-sm font-medium capitalize">{c.preferred_contact}</dd>
                </div>
                {c.phone && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd className="text-sm">{c.phone}</dd>
                  </div>
                )}
                {c.email && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="text-sm">{c.email}</dd>
                  </div>
                )}
                {c.company_name && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Company</dt>
                    <dd className="text-sm">{c.company_name}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </TabsContent>

        {/* Jobs */}
        <TabsContent value="jobs">
          {clientJobs.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No jobs yet"
              description="Jobs assigned to this client will appear here."
            />
          ) : (
            <div className="space-y-2">
              {clientJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/jobs/${job.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card px-5 py-4 hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    {job.scheduled_date && (
                      <p className="text-xs text-muted-foreground">{formatDate(job.scheduled_date)}</p>
                    )}
                  </div>
                  <StatusBadge status={job.status} type="job" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Notes */}
        <TabsContent value="notes">
          <EmptyState
            icon={ClipboardList}
            title="No notes"
            description="Client notes will appear here in a future update."
          />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity">
          <EmptyState
            icon={Activity}
            title="No activity"
            description="Activity history will appear here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
