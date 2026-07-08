'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cached auth/company preamble for client pages.
 *
 * Nearly every dashboard page opened with the same two network round trips
 * before fetching any real data: `auth.getUser()` (hits the auth server)
 * then a `profiles` select for company_id/role. On production latency
 * that's 100-300ms of spinner per page, every page. This helper answers
 * from a per-tab cache instead:
 *  - uid comes from `getSession()` (local JWT, no network),
 *  - the profiles row is fetched once per tab and kept in sessionStorage,
 *  - the cached uid is always re-checked against the live session, so an
 *    account switch in the same tab can't leak the previous user's context.
 */

export interface CompanyContext {
  userId: string;
  companyId: string;
  role: string;
  fullName: string | null;
}

const KEY = 'tlc.company-context.v1';
let memo: CompanyContext | null = null;

export async function getCompanyContext(
  supabase: SupabaseClient,
): Promise<CompanyContext | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return null;

  if (memo?.userId === uid) return memo;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CompanyContext;
      if (parsed.userId === uid && parsed.companyId) {
        memo = parsed;
        return memo;
      }
    }
  } catch { /* storage unavailable — fall through to the network */ }

  const { data } = await supabase
    .from('profiles')
    .select('company_id, role, full_name')
    .eq('id', uid)
    .single();
  if (!data?.company_id) return null;
  memo = {
    userId: uid,
    companyId: data.company_id,
    role: data.role,
    fullName: data.full_name ?? null,
  };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* fine */ }
  return memo;
}

/** Call on sign-out so the next login can't see stale context. */
export function clearCompanyContext() {
  memo = null;
  try { window.sessionStorage.removeItem(KEY); } catch { /* fine */ }
}
