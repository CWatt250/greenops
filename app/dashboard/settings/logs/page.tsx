export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Settings → Message & error log. Answers "did the reminder go out?" and
 * "what broke yesterday?" from the outbound_messages and client_errors
 * tables (office-only via RLS).
 */
const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800', skipped: 'bg-muted text-muted-foreground',
};
const TEMPLATE_LABEL: Record<string, string> = {
  job_reminder: 'Appointment reminder', review_request: 'Review request', crew_enroute: 'On my way', request_received: 'Request received',
  invoice: 'Invoice', proposal: 'Proposal', portal_invite: 'Portal invite', recovery: 'Password reset',
};

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'messages' } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: messages }, { data: errors }] = await Promise.all([
    supabase.from('outbound_messages').select('id, channel, recipient, template, status, error, created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('client_errors').select('id, path, message, digest, created_at, profile:profiles!client_errors_profile_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/settings" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link>
      <PageHeader title="Message & error log" description="Every email and text the app sent or skipped, and every crash a user hit." />
      <div className="mb-4 flex gap-2">
        {[{ k: 'messages', l: `Messages (${messages?.length ?? 0})` }, { k: 'errors', l: `Errors (${errors?.length ?? 0})` }].map((t) => (
          <Link key={t.k} href={`?tab=${t.k}`} className={cn('rounded-full px-4 py-2 text-sm font-medium', tab === t.k ? 'text-white' : 'bg-muted text-muted-foreground')} style={tab === t.k ? { backgroundColor: 'var(--orange)' } : undefined}>{t.l}</Link>
        ))}
      </div>

      {tab === 'messages' ? (
        (messages ?? []).length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Nothing sent yet. Reminders, review requests, on-my-way texts, and website-request confirmations will show up here.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {(messages ?? []).map((m) => (
              <li key={m.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{TEMPLATE_LABEL[m.template] ?? m.template} <span className="text-muted-foreground">· {m.channel === 'sms' ? 'text' : 'email'} to {m.recipient}</span></p>
                  {m.error && <p className="truncate text-xs text-red-700">{m.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide', STATUS_STYLE[m.status] ?? '')}>{m.status}</span>
                  <span className="tabular-nums">{when(m.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        (errors ?? []).length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No crashes reported. When a page errors for someone, it lands here and the owner gets a notification.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {(errors ?? []).map((e) => (
              <li key={e.id} className="p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <p className="min-w-0 break-words text-sm font-medium">{e.message}</p>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(e.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{e.path ?? '—'}{(e.profile as unknown as { full_name?: string } | null)?.full_name ? ` · ${(e.profile as unknown as { full_name?: string }).full_name}` : ''}{e.digest ? ` · ref ${e.digest}` : ''}</p>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
