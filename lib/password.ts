import { z } from 'zod';

/**
 * One password rule for every place a password is set (reset link, Settings,
 * future invites). Sign-in never enforces length — existing accounts may
 * predate this rule. Keep in step with the Supabase Auth "minimum password
 * length" setting so the server rejects the same inputs the client does.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, 'Use at most 72 characters')
  .refine((p) => !/^(.)\1+$/.test(p), 'Pick something less repetitive');
