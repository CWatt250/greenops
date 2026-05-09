export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalBannerForm } from '@/components/settings/portal-banner-form';
import { NoteTemplatesManager } from '@/components/settings/note-templates-manager';
import { OverheadForm } from '@/components/settings/overhead-form';

interface CompanyData {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  portal_banner_message?: string | null;
  portal_banner_cta_label?: string | null;
  portal_banner_cta_url?: string | null;
  portal_banner_expires_at?: string | null;
  portal_banner_enabled?: boolean | null;
  overhead_pct?: number | null;
}

interface ProfileWithCompany {
  full_name?: string;
  role?: string;
  company: CompanyData | null;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `full_name, role, company:companies(
        id, name, phone, email,
        portal_banner_message, portal_banner_cta_label, portal_banner_cta_url,
        portal_banner_expires_at, portal_banner_enabled,
        overhead_pct
      )`
    )
    .eq('id', user.id)
    .single();

  const p = profile as ProfileWithCompany | null;
  const c = p?.company ?? null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Manage your account and company settings" />

      <PageIntro
        id="settings"
        title="Account, company, and team"
        description="Update your profile, configure company-wide defaults like overhead percentage, and invite teammates from here."
        steps={[
          'Your account info is editable up top.',
          'Company defaults — like overhead % — flow through to costing and profitability.',
          'Invite owners, dispatchers, or crew with the Team section.',
        ]}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="text-sm font-medium">{p?.full_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="text-sm font-medium capitalize">{p?.role ?? '—'}</p>
            </div>
          </CardContent>
        </Card>

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Company Name</p>
                <p className="text-sm font-medium">{c.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm font-medium">{c.phone ?? '—'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Costing</CardTitle>
            </CardHeader>
            <CardContent>
              <OverheadForm
                companyId={c.id}
                initialOverheadPct={Number(c.overhead_pct ?? 15)}
              />
            </CardContent>
          </Card>
        )}

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portal Banner</CardTitle>
            </CardHeader>
            <CardContent>
              <PortalBannerForm companyId={c.id} initial={c} />
            </CardContent>
          </Card>
        )}

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Note Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <NoteTemplatesManager companyId={c.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
