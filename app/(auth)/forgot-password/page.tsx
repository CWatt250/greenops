'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MailCheck } from 'lucide-react';

const schema = z.object({ email: z.string().email('Please enter a valid email') });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: Form) {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Rate-limit errors are worth surfacing; "no such user" deliberately is not.
    if (error && /rate|limit|too many/i.test(error.message)) {
      setError('Too many requests — wait a minute and try again.');
      return;
    }
    setSent(true);
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
          Reset your password
        </h1>

        {sent ? (
          <div className="mt-6 text-center">
            <MailCheck className="mx-auto h-10 w-10" style={{ color: 'var(--color-brand-green-raw)' }} />
            <p className="mt-3 text-sm">
              If that email has an account, a reset link is on its way. It expires in one hour.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Check spam if it hasn&apos;t arrived in a few minutes.</p>
            <Link href="/login" className="mt-6 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--color-brand-green-raw)' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Enter the email you sign in with and we&apos;ll send a link to choose a new password.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" autoFocus {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full text-white font-semibold" style={{ backgroundColor: 'var(--color-brand-green-raw)' }} disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Remembered it?{' '}
              <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--color-brand-green-raw)' }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
