export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PageIntro } from '@/components/help/page-intro';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalBannerForm } from '@/components/settings/portal-banner-form';
import { NoteTemplatesManager } from '@/components/settings/note-templates-manager';
import { OverheadForm } from '@/components/settings/overhead-form';
import { CompanyInfoForm } from '@/components/settings/company-info-form';
import { PasswordForm } from '@/components/settings/password-form';
import { DepotForm } from '@/components/settings/depot-form';
import { WeatherSettingsForm } from '@/components/settings/weather-settings-form';
import type { Company } from '@/types';

interface ProfileWithCompany {
  full_name?: string;
  role?: string;
  company: Company | null;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, company:companies(*)')
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
        description="Update your profile, configure company-wide defaults like overhead percentage, and tune what shows on the dashboard."
        steps={[
          'Company defaults — like overhead % — flow through to costing and profitability.',
          'Weather Watch is fully configurable: pick a location, forecast length, and °F vs °C.',
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
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Password</p>
              <PasswordForm />
            </div>
          </CardContent>
        </Card>

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company information</CardTitle>
            </CardHeader>
            <CardContent>
              <CompanyInfoForm company={c} />
            </CardContent>
          </Card>
        )}

        {c && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Depot / HQ</CardTitle>
            </CardHeader>
            <CardContent>
              <DepotForm
                companyId={c.id}
                initial={{
                  depot_address: c.depot_address ?? null,
                  depot_latitude: c.depot_latitude ?? null,
                  depot_longitude: c.depot_longitude ?? null,
                }}
              />
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
              <CardTitle className="text-base">Weather Watch</CardTitle>
            </CardHeader>
            <CardContent>
              <WeatherSettingsForm company={c} />
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
