'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, MessageSquare, AlertTriangle, ClipboardList, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ActivityItem {
  id: string;
  type: 'message' | 'complaint' | 'request';
  title: string;
  subtitle: string;
  clientName: string;
  severity?: string;
  createdAt: string;
  href: string;
}

interface Props {
  companyId: string;
}

export function PortalActivityFeed({ companyId }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [reqRes, compRes, msgRes] = await Promise.all([
      supabase
        .from('service_requests')
        .select('id, title, type, status, created_at, client:clients(name)')
        .eq('company_id', companyId)
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('complaints')
        .select('id, title, severity, status, created_at, client:clients(name)')
        .eq('company_id', companyId)
        .in('status', ['open', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('messages')
        .select('id, body, client_id, created_at, client:clients(name)')
        .eq('company_id', companyId)
        .eq('sender_type', 'portal_user')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const activity: ActivityItem[] = [
      ...((reqRes.data ?? []) as unknown as Array<{ id: string; title: string; type: string; status: string; created_at: string; client: { name: string } | null }>).map((r) => ({
        id: `req-${r.id}`,
        type: 'request' as const,
        title: r.title,
        subtitle: `Status: ${r.status}`,
        clientName: r.client?.name ?? '—',
        createdAt: r.created_at,
        href: '/portal-admin/requests',
      })),
      ...((compRes.data ?? []) as unknown as Array<{ id: string; title: string; severity: string; status: string; created_at: string; client: { name: string } | null }>).map((c) => ({
        id: `comp-${c.id}`,
        type: 'complaint' as const,
        title: c.title,
        subtitle: `Severity: ${c.severity}`,
        clientName: c.client?.name ?? '—',
        severity: c.severity,
        createdAt: c.created_at,
        href: '/portal-admin/complaints',
      })),
      ...((msgRes.data ?? []) as unknown as Array<{ id: string; body: string; client_id: string; created_at: string; client: { name: string } | null }>).map((m) => ({
        id: `msg-${m.id}`,
        type: 'message' as const,
        title: m.body.slice(0, 60),
        subtitle: 'Unread message',
        clientName: m.client?.name ?? '—',
        createdAt: m.created_at,
        href: '/portal-admin',
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setItems(activity);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('portal-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `company_id=eq.${companyId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints', filter: `company_id=eq.${companyId}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  const ICONS = {
    request: <ClipboardList className="h-4 w-4" />,
    complaint: <AlertTriangle className="h-4 w-4" />,
    message: <MessageSquare className="h-4 w-4" />,
  };

  const ICON_BG: Record<string, string> = {
    request: 'bg-blue-100 text-blue-600',
    complaint: 'bg-red-100 text-red-600',
    message: 'bg-green-100 text-green-600',
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
        <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">All caught up — no pending portal activity</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden divide-y">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            'flex items-start gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors',
            item.type === 'complaint' && item.severity === 'high' && 'bg-red-50/40'
          )}
        >
          <div className={cn('mt-0.5 rounded-full p-1.5 shrink-0', ICON_BG[item.type])}>
            {ICONS[item.type]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{item.title}</p>
              {item.type === 'complaint' && item.severity === 'high' && (
                <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5">HIGH</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.clientName} · {item.subtitle}
            </p>
          </div>
          <p className="text-xs text-muted-foreground shrink-0 mt-0.5">
            {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </Link>
      ))}
    </div>
  );
}
