'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

/** Rendered by the app layouts when profiles.is_active is false. */
export function DeactivatedScreen() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">This account has been deactivated</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask an owner at your company to reactivate it if you think this is a mistake.</p>
        <Button onClick={signOut} className="mt-6">Sign out</Button>
      </div>
    </div>
  );
}
