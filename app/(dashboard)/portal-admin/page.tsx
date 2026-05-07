import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PortalActivityFeed } from '@/components/portal-admin/portal-activity-feed';
import { AdminMessageThread } from '@/components/portal-admin/admin-message-thread';
import { ClipboardList, AlertTriangle } from 'lucide-react';

export default async function PortalAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');
  if (profile.role === 'customer') redirect('/portal');

  const [reqCount, compCount] = await Promise.all([
    supabase.from('service_requests').select('id', { count: 'exact', head: true })
      .eq('company_id', profile.company_id).in('status', ['pending', 'reviewing']),
    supabase.from('complaints').select('id', { count: 'exact', head: true })
      .eq('company_id', profile.company_id).in('status', ['open', 'reviewing']),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Customer Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage portal users, requests, and messages.</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link
          href="/portal-admin/requests"
          className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Open Requests</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">{reqCount.count ?? 0}</p>
        </Link>
        <Link
          href="/portal-admin/complaints"
          className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Open Issues</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">{compCount.count ?? 0}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Activity feed */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pending Activity</h2>
          <PortalActivityFeed companyId={profile.company_id} />
        </div>

        {/* Messages */}
        <div className="flex flex-col" style={{ height: '32rem' }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Messages</h2>
          <div className="flex-1 overflow-hidden">
            <AdminMessageThread companyId={profile.company_id} adminId={user.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
