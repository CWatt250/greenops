import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Leaf } from 'lucide-react';
import { NotificationBell } from '@/components/shared/notification-bell';

export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  // Dispatchers and owners belong in the main dashboard
  if (profile?.role === 'owner' || profile?.role === 'dispatcher') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 border-b shrink-0"
        style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-green-raw)]">
            <Leaf className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">TLC GreenOps</p>
            {profile?.full_name && (
              <p className="text-[11px] text-white/50 leading-tight">{profile.full_name}</p>
            )}
          </div>
        </div>
        <NotificationBell />
      </header>
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">{children}</main>
    </div>
  );
}
