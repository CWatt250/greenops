import { notFound } from 'next/navigation';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { PublicRequestForm } from '@/components/public/request-form';
import { Leaf } from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

/**
 * Public "request a quote" page — put /request/<slug> on the company's
 * website or a QR code. No login. Submissions land in Portal Inbox as
 * pending service requests attached to a lead client.
 */
async function loadCompany(slug: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await admin
    .from('companies')
    .select('name, slug, logo_url, tagline, phone, email, service_area, public_requests_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!data || data.public_requests_enabled === false) return null;
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  return { title: company ? `Request a quote · ${company.name}` : 'Request a quote' };
}

export default async function PublicRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) notFound();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-brand-cream-raw)' }}>
      <header className="px-5 py-4" style={{ backgroundColor: 'var(--color-brand-dark-raw)' }}>
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {company.logo_url ? (
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={company.logo_url} alt="" className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-brand-green-raw)' }}>
              <Leaf className="h-5 w-5 text-white" />
            </div>
          )}
          <div>
            <p className="text-base font-bold leading-none text-white">{company.name}</p>
            {company.tagline && <p className="mt-1 text-[12px] leading-tight" style={{ color: 'var(--orange)' }}>{company.tagline}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold">Request a quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us about your property and what you need. We&rsquo;ll get back to you
          {company.service_area ? ` — we serve ${company.service_area}` : ''}.
        </p>
        <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <PublicRequestForm slug={company.slug} companyName={company.name} />
        </div>
        {(company.phone || company.email) && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Prefer to talk? {company.phone && <a href={`tel:${company.phone}`} className="font-medium underline">{company.phone}</a>}
            {company.phone && company.email && ' · '}
            {company.email && <a href={`mailto:${company.email}`} className="font-medium underline">{company.email}</a>}
          </p>
        )}
      </main>
    </div>
  );
}
