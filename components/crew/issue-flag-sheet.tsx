'use client';

import { useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PhotoAttachInput, type AttachedPhoto } from '@/components/portal/photo-attach-input';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { enqueue } from '@/lib/offline-queue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  companyId: string;
  profileId: string;
  /** Called after a successful flag so the parent can refetch. */
  onFlagged: () => void;
}

/**
 * Sheet that captures issue notes + optional photos before flipping the
 * job to status='issue'. If the device is offline, the status flip is
 * queued in localStorage and replayed on reconnect (photos still need a
 * connection to upload, so they're submitted now and the status flip is
 * the only thing queued).
 */
export function IssueFlagSheet({
  open, onOpenChange, jobId, companyId, profileId, onFlagged,
}: Props) {
  const supabase = createClient();
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setNotes('');
    setPhotos([]);
  }

  async function handleSubmit() {
    if (!notes.trim()) {
      toast.error('Briefly describe the issue.');
      return;
    }
    if (photos.some((p) => (p as { uploading?: boolean }).uploading)) {
      toast.error('Wait for photos to finish uploading.');
      return;
    }
    setSubmitting(true);

    const nowIso = new Date().toISOString();

    // Persist photo rows for issue context (best-effort — photos already
    // landed in storage). Caption='Issue' so admin views can label.
    if (photos.length > 0) {
      try {
        await supabase.from('job_photos').insert(
          photos.map((p) => ({
            company_id: companyId,
            job_id: jobId,
            uploaded_by: profileId,
            storage_path: p.storagePath,
            caption: 'Issue',
          })),
        );
      } catch {
        // Continue — the status flip is more important than the photo rows.
      }
    }

    // Status flip: try direct DB write first; if it fails (offline or
    // network blip), queue for later replay.
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'issue',
        issue_notes: notes.trim(),
        issue_flagged_at: nowIso,
        issue_flagged_by: profileId,
        updated_at: nowIso,
      })
      .eq('id', jobId);

    if (error) {
      enqueue({
        kind: 'flag_issue',
        payload: { job_id: jobId, notes: notes.trim(), flagged_by: profileId },
      });
      toast.success('Issue queued — will sync when you reconnect.');
    } else {
      toast.success('Issue flagged.');
    }

    setSubmitting(false);
    reset();
    onOpenChange(false);
    onFlagged();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}
    >
      <SheetContent side="bottom" className="h-auto max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="h-4 w-4" /> Flag an issue
          </SheetTitle>
          <SheetDescription>
            What happened? Dispatch will see this immediately.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="issue-notes">What&apos;s the issue?</Label>
            <Textarea
              id="issue-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Sprinkler head broken near front bed; mowing skipped that section."
              rows={4}
              autoFocus
            />
          </div>

          <PhotoAttachInput
            pathPrefix={`${companyId}/jobs/${jobId}/issues`}
            photos={photos}
            onChange={setPhotos}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !notes.trim()}
              className="flex-1 text-white gap-1.5"
              style={{ backgroundColor: '#DC2626' }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Flag issue
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
