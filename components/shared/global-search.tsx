'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Users, Briefcase, Receipt, FileText, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Hit = { id: string; kind: 'client' | 'job' | 'invoice' | 'proposal'; title: string; sub: string; href: string };

/**
 * Cmd/Ctrl-K search over clients, jobs, invoices, and proposals. Queries run
 * against the browser client (RLS-scoped) with small limits; results open
 * on Enter. Exposed as a dialog plus a trigger button for the sidebar and
 * mobile header.
 */
let openRef: ((v: boolean) => void) | null = null;
export function openGlobalSearch() { openRef?.(true); }

export function GlobalSearchTrigger({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => openGlobalSearch()}
      aria-label="Search"
      className={cn(
        compact
          ? 'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-background text-foreground hover:bg-accent'
          : 'flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      {!compact && <span className="flex-1">Search…</span>}
      {!compact && <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/50">⌘K</kbd>}
    </button>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    openRef = setOpen;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); openRef = null; };
  }, []);

  const search = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) { setHits([]); return; }
    setLoading(true);
    const supabase = createClient();
    const like = `%${t.replace(/[%_]/g, ' ')}%`;
    const [clients, jobs, invoices, proposals] = await Promise.all([
      supabase.from('clients').select('id, name, service_address, phone').or(`name.ilike.${like},service_address.ilike.${like},phone.ilike.${like}`).limit(5),
      supabase.from('jobs').select('id, title, scheduled_date, status, client:clients(name)').ilike('title', like).order('scheduled_date', { ascending: false }).limit(5),
      supabase.from('invoices').select('id, invoice_number, status, total, client:clients(name)').ilike('invoice_number', like).limit(4),
      supabase.from('estimates').select('id, title, status, client:clients(name)').ilike('title', like).order('created_at', { ascending: false }).limit(4),
    ]);
    const out: Hit[] = [];
    for (const c of clients.data ?? []) out.push({ id: c.id, kind: 'client', title: c.name, sub: [c.service_address, c.phone].filter(Boolean).join(' · '), href: `/dashboard/clients/${c.id}` });
    for (const j of jobs.data ?? []) out.push({ id: j.id, kind: 'job', title: j.title, sub: [(j.client as unknown as { name: string } | null)?.name, j.scheduled_date, j.status].filter(Boolean).join(' · '), href: `/dashboard/jobs/${j.id}` });
    for (const i of invoices.data ?? []) out.push({ id: i.id, kind: 'invoice', title: i.invoice_number, sub: [(i.client as unknown as { name: string } | null)?.name, i.status, `$${Number(i.total).toFixed(2)}`].filter(Boolean).join(' · '), href: `/dashboard/invoices/${i.id}` });
    for (const p of proposals.data ?? []) out.push({ id: p.id, kind: 'proposal', title: p.title, sub: [(p.client as unknown as { name: string } | null)?.name, p.status].filter(Boolean).join(' · '), href: `/dashboard/proposals/${p.id}` });
    setHits(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void search(q); }, 200);
    return () => clearTimeout(t);
  }, [q, search]);

  const groups: Array<{ kind: Hit['kind']; label: string; icon: typeof Users }> = [
    { kind: 'client', label: 'Clients', icon: Users },
    { kind: 'job', label: 'Jobs', icon: Briefcase },
    { kind: 'invoice', label: 'Invoices', icon: Receipt },
    { kind: 'proposal', label: 'Proposals', icon: FileText },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find a client, job, invoice, or proposal">
      {/* Results are already filtered server-side; cmdk must not re-filter them. */}
      <Command shouldFilter={false}>
      <CommandInput placeholder="Search clients, jobs, invoices, proposals…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q.trim().length < 2 ? 'Type at least two characters.' : loading ? 'Searching…' : 'No matches.'}</CommandEmpty>
        {groups.map((g) => {
          const items = hits.filter((h) => h.kind === g.kind);
          if (!items.length) return null;
          return (
            <CommandGroup key={g.kind} heading={g.label}>
              {items.map((h) => (
                <CommandItem key={h.id} value={`${h.kind}-${h.id}-${h.title}`} onSelect={() => { setOpen(false); router.push(h.href); }}>
                  <g.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{h.title}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{h.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
