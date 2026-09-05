'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { notifyCustomer } from '@/lib/notify';
import { fileSrc } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Complaint } from '@/types';

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  reviewing: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
};

interface Props {
  complaints: Complaint[];
  onUpdate: (updated: Complaint) => void;
}

export function ComplaintQueue({ complaints, onUpdate }: Props) {
  const supabase = createClient();
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  async function updateStatus(complaint: Complaint, status: Complaint['status'], notes?: string) {
    setActioning(status);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (notes) patch.resolution_notes = notes;
    if (status === 'resolved' || status === 'closed') {
      patch.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('complaints')
      .update(patch)
      .eq('id', complaint.id)
      .select()
      .single();

    if (error) { toast.error(error.message); setActioning(null); return; }

    if (complaint.portal_user_id) {
      await notifyCustomer(supabase, {
        portalUserId: complaint.portal_user_id,
        title: `Issue update: ${complaint.title}`,
        body: `Your reported issue is now ${status}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
        type: 'complaint_update',
        entityType: 'complaint',
        entityId: complaint.id,
      });
    }

    toast.success(`Complaint ${status}.`);
    onUpdate(data as Complaint);
    setSelected(null);
    setActioning(null);
  }

  if (complaints.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
        <p className="text-sm text-muted-foreground">No complaints</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              {['Client', 'Title', 'Severity', 'Status', 'Created', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {complaints.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-muted/20 cursor-pointer"
                onClick={() => { setSelected(c); setResolutionNotes(c.resolution_notes ?? ''); }}
              >
                <td className="px-4 py-3 font-medium">
                  {(c.client as { name: string } | null | undefined)?.name ?? '—'}
                </td>
                <td className="px-4 py-3 max-w-48 truncate">{c.title}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', SEVERITY_COLORS[c.severity])}>
                    {c.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_COLORS[c.status])}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                  {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(c); setResolutionNotes(c.resolution_notes ?? ''); }}>
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
                    <p className="text-xs text-muted-foreground">Severity</p>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize mt-0.5', SEVERITY_COLORS[selected.severity])}>
                      {selected.severity}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize mt-0.5', STATUS_COLORS[selected.status])}>
                      {selected.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{(selected.client as { name: string } | null | undefined)?.name ?? '—'}</p>
                  </div>
                  {selected.job_id && (
                    <div>
                      <p className="text-xs text-muted-foreground">Job</p>
                      <p className="font-medium text-xs truncate">{selected.job_id}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm bg-muted/30 rounded-lg p-3">{selected.description}</p>
                </div>
                {selected.photo_urls && selected.photo_urls.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Photos</p>
                    <div className="flex gap-2 flex-wrap">
                      {selected.photo_urls.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={fileSrc('job-photos', url) ?? undefined}
                          alt={`Photo ${i + 1}`}
                          className="h-20 w-20 rounded-lg object-cover border"
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-xs mb-1 block">Resolution Notes (sent to client)</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe how this was resolved…"
                    className="resize-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {selected.status === 'open' && (
                    <Button
                      onClick={() => updateStatus(selected, 'reviewing', resolutionNotes)}
                      disabled={actioning !== null}
                      variant="outline"
                      className="gap-1.5"
                    >
                      {actioning === 'reviewing' && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Eye className="h-4 w-4" /> Mark Reviewing
                    </Button>
                  )}
                  {selected.status !== 'resolved' && selected.status !== 'closed' && (
                    <Button
                      onClick={() => updateStatus(selected, 'resolved', resolutionNotes)}
                      disabled={actioning !== null}
                      className="gap-1.5"
                      style={{ backgroundColor: 'var(--color-brand-green-raw)' }}
                    >
                      {actioning === 'resolved' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark Resolved
                    </Button>
                  )}
                  {selected.status === 'resolved' && (
                    <Button
                      onClick={() => updateStatus(selected, 'closed')}
                      disabled={actioning !== null}
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                    >
                      {actioning === 'closed' && <Loader2 className="h-4 w-4 animate-spin" />}
                      Close
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
