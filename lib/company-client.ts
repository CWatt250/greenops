import { createClient } from '@/lib/supabase/client';
import type { Company } from '@/types';

/**
 * Fetch the current user's company row. Used by client components that need
 * branding info (PDF generation, portal pages). Throws on auth failure.
 */
export async function fetchOwnCompany(): Promise<Company | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const companyId = (profile as { company_id?: string } | null)?.company_id;
  if (!companyId) return null;

  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  return (data as Company | null) ?? null;
}

/**
 * Fallback used when a PDF is requested but the company row can't be loaded
 * (offline, RLS, etc.). Keeps PDFs branded but generic.
 */
export const FALLBACK_COMPANY: Company = {
  id: '',
  name: 'Your Company',
  slug: '',
  created_at: new Date().toISOString(),
};
