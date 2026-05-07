export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Briefcase, Users, AlertTriangle, UsersRound, Plus, MapPin } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import type { Job } from '@/types';

async function getDashboardData() {
  const supabase = await createClient();

  const today = new Date().toISOString().split('T')[0];

  const [todayJobsResult, clientsResult, issuesResult, crewsResult, recentJobsResult] =
    await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('scheduled_date', today),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'issue'),
      supabase.from('crews').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('jobs')
        .select('id, title, status, scheduled_date, client:clients(name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  return {
    todayJobs: todayJobsResult.count ?? 0,
    activeClients: clientsResult.count ?? 0,
    openIssues: issuesResult.count ?? 0,
    crewsOut: crewsResult.count ?? 0,
    recentJobs: (recentJobsResult.data ?? []) as unknown as (Job & { client: { name: string } | null })[],
  };
}

export default async function DashboardPage() {
  // Crew members use the mobile app, not the dispatcher dashboard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role === 'crew') redirect('/today');
  }

  const { todayJobs, activeClients, openIssues, crewsOut, recentJobs } =
    await getDashboardData();

  const stats = [
    { label: "Today's Jobs", value: todayJobs, icon: Briefcase, color: 'var(--color-brand-green-raw)' },
    { label: 'Active Clients', value: activeClients, icon: Users, color: 'var(--color-brand-gold-raw)' },
    { label: 'Open Issues', value: openIssues, icon: AlertTriangle, color: '#EF4444' },
    { label: 'Crews Out', value: crewsOut, icon: UsersRound, color: '#3B82F6' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Welcome to GreenOps">
        <Link
          href="/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1">{value}</p>
                </div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link
          href="/jobs/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Job
        </Link>
        <Link
          href="/clients/new"
          className={buttonVariants()}
          style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Client
        </Link>
        <Link href="/jobs" className={buttonVariants({ variant: 'outline' })}>
          <MapPin className="h-4 w-4 mr-1.5" /> View Today's Routes
        </Link>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No jobs yet.</p>
          ) : (
            <div className="divide-y">
              {recentJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    {job.client && (
                      <p className="text-xs text-muted-foreground">{job.client.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {job.scheduled_date && (
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(job.scheduled_date)}
                      </span>
                    )}
                    <StatusBadge status={job.status} type="job" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
