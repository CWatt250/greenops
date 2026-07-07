'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { notifyCustomer } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Loader2, Calendar, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { ServiceRequest } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  new_service: '🌿 New Service', reschedule: '📅 Reschedule',
  quote_request: '💰 Quote', cancel: '❌ Cancel', seasonal: '🍂 Seasonal', other: '💬 Other',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  reviewing: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

interface Props {
  requests: ServiceRequest[];
  onUpdate: (updated: ServiceRequest) => void;
}

export function RequestQueue({ requests, onUpdate }: Props) {
  const supabase = createClient();
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  async function updateStatus(req: ServiceRequest, status: ServiceRequest['status'], notes?: string) {
    setActioning(status);
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (notes) patch.admin_notes = notes;
    if (status === 'scheduled' || status === 'completed' || status === 'declined') {
      const { data: { user } } = await supabase.auth.getUser();
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = user?.id;
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update(patch)
      .eq('id', req.id)
      .select()
      .single();

    if (error) { toast.error(error.message); setActioning(null); return; }

    // Notify portal user
    if (req.portal_user_id) {
      await notifyCustomer(supabase, {
        portalUserId: req.portal_user_id,
        title: `Request update: ${req.title}`,
        body: `Status changed to ${status}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
        type: 'request_update',
        entityType: 'service_request',
        entityId: req.id,
      });
    }

    toast.success(`Request ${status}.`);
    onUpdate(data as ServiceRequest);
    setSelected(null);
    setActioning(null);
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
        <p className="text-sm text-muted-foreground">No requests</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              {['Client', 'Type', 'Title', 'Preferred Date', 'Status', 'Created', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((req) => (
              <tr
                key={req.id}
                className="hover:bg-muted/20 cursor-pointer"
                onClick={() => { setSelected(req); setAdminNotes(req.admin_notes ?? ''); }}
              >
                <td className="px-4 py-3 font-medium">
                  {(req.client as { name: string } | null | undefined)?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs">{TYPE_LABELS[req.type] ?? req.type}</td>
                <td className="px-4 py-3 max-w-48 truncate">{req.title}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{req.preferred_date ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_COLORS[req.status])}>
                    {req.status}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                  {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(req); setAdminNotes(req.admin_notes ?? ''); }}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selected.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-1">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium">{TYPE_LABELS[selected.type]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize mt-0.5', STATUS_COLORS[selected.status])}>
                      {selected.status}
                    </span>
                  </div>
                  {selected.preferred_date && (
                    <div>
                      <p className="text-xs text-muted-foreground">Preferred Date</p>
                      <p className="font-medium">{selected.preferred_date}</p>
                    </div>
                  )}
                  {selected.preferred_time && (
                    <div>
                      <p className="text-xs text-muted-foreground">Preferred Time</p>
                      <p className="font-medium">{selected.preferred_time}</p>
                    </div>
                  )}
                </div>
                {selected.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm bg-muted/30 rounded-lg p-3">{selected.description}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs mb-1 block">Admin Notes (sent to client)</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    placeholder="Optional note to client…"
                    className="resize-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {selected.status === 'pending' && (
                    <Button
                      onClick={() => updateStatus(selected, 'reviewing', adminNotes)}
                      disabled={actioning !== null}
                      variant="outline"
                      className="gap-1.5"
                    >
                      {actioning === 'reviewing' && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Eye className="h-4 w-4" /> Mark Reviewing
                    </Button>
                  )}
                  <Link
                    href={`/dashboard/jobs/new?client_id=${selected.client_id}&request_id=${selected.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    onClick={async () => {
                      if (selected.status !== 'scheduled') {
                        await updateStatus(selected, 'scheduled', adminNotes);
                      }
                    }}
                  >
                    <Calendar className="h-4 w-4" /> Schedule It
                  </Link>
                  {selected.status !== 'declined' && (
                    <Button
                      onClick={() => updateStatus(selected, 'declined', adminNotes)}
                      disabled={actioning !== null}
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      {actioning === 'declined' && <Loader2 className="h-4 w-4 animate-spin" />}
                      <X className="h-4 w-4" /> Decline
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
