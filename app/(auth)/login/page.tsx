'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl bg-white p-8 shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/tlc-logo.png"
            alt="TLC Landscape Management"
            width={275}
            height={120}
            className="h-auto w-40 object-contain"
            priority
          />
        </div>

        <p
          className="text-center mb-1"
          style={{
            fontFamily: 'var(--font-hand), cursive',
            fontSize: '20px',
            color: 'var(--orange)',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          — Welcome back
        </p>
        <h1
          className="text-center text-foreground mb-1 uppercase"
          style={{
            fontFamily: 'var(--font-display), Impact, sans-serif',
            fontSize: '30px',
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
          }}
        >
          TLC Management Platform
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Sign in to continue
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="dispatcher@tlc.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full text-white font-semibold"
            style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  );
}
