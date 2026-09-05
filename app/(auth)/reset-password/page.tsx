'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordSchema } from '@/lib/password';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Form = z.infer<typeof schema>;

/**
 * Reached from the recovery email via /auth/callback, which has already
 * exchanged the link for a session. Also usable by any signed-in user.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setHasSession(!!user);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit({ password }: Form) {
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    toast.success('Password updated. You are signed in.');
    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <Image src="/tlc-logo.png" alt="TLC Landscape Management" width={275} height={120} className="h-auto w-36 object-contain" priority />
        </div>
        <h1
          className="text-center text-foreground mb-1 uppercase"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontSize: '24px', letterSpacing: '-0.01em', lineHeight: 1.05 }}
        >
          Choose a new password
        </h1>

        {hasSession === false ? (
          <div className="mt-6 text-center">
            <p className="text-sm">This reset link has expired or was already used.</p>
            <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--color-brand-green-raw)' }}>
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground text-center mb-6">At least 10 characters. A short phrase works well.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" autoComplete="new-password" autoFocus {...register('password')} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full text-white font-semibold" style={{ backgroundColor: 'var(--color-brand-green-raw)' }} disabled={isSubmitting || hasSession === null}>
                {isSubmitting ? 'Saving…' : 'Save password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
