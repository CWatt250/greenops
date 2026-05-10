import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Ruler } from 'lucide-react';
import { NotificationBell } from '@/components/shared/notification-bell';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

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
        className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 border-b border-[var(--moss-800)] shrink-0"
        style={{ backgroundColor: '#000' }}
      >
        <div className="flex items-center gap-2.5">
          <Image
            src="/tlc-logo.png"
            alt="TLC"
            width={36}
            height={36}
            className="h-9 w-auto"
          />
          <div>
            <p
              className="text-white uppercase leading-none"
              style={{
                fontFamily: 'var(--font-display), Impact, sans-serif',
                fontSize: '11px',
                letterSpacing: '0.1em',
              }}
            >
              Crew Mobile
            </p>
            {profile?.full_name && (
              <p className="text-[11px] text-white/60 leading-tight mt-0.5">{profile.full_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/measure"
            aria-label="Measure property"
            title="Measure property"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Ruler className="h-4 w-4" />
          </Link>
          <NotificationBell />
        </div>
      </header>
      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full">{children}</main>
      <MobileBottomNav role="crew" />
    </div>
  );
}
