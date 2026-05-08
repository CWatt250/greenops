export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CompanyData {
  id: string;
  name: string;
  phone?: string;
  email?: string;
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
    .select('full_name, role, company:companies(id, name, phone, email)')
    .eq('id', user.id)
    .single();

  const p = profile as ProfileWithCompany | null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Manage your account and company settings" />

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

        {p?.company && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Company Name</p>
                <p className="text-sm font-medium">{p.company.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm font-medium">{p.company.phone ?? '—'}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
