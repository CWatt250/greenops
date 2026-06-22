'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileSrc } from '@/lib/storage';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface JobPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
}

interface Props {
  photos: JobPhoto[];
  /** Owner/dispatcher only — gates the delete control (and matches RLS). */
  canDelete: boolean;
}

/**
 * Job photo thumbnails (dashboard). Each opens full-size through the signed-URL
 * proxy; owner/dispatcher get an X to delete. Delete removes the DB row first
 * (RLS-guarded) then the storage object, and refreshes.
 */
export function JobPhotoGrid({ photos, canDelete }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(p: JobPhoto) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    setDeleting(p.id);
    try {
      // Row first (RLS-guarded): if we're not allowed, stop before touching storage.
      const { error } = await supabase.from('job_photos').delete().eq('id', p.id);
      if (error) throw error;
      // Best-effort object cleanup; a stale object without a row never displays.
      await supabase.storage.from('job-photos').remove([p.storage_path]).catch(() => {});
      toast.success('Photo deleted.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not delete photo.');
    } finally {
      setDeleting(null);
    }
  }

  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
      {photos.map((p) => {
        const src = fileSrc('job-photos', p.storage_path) ?? undefined;
        return (
          <div
            key={p.id}
            className="relative aspect-square rounded-lg overflow-hidden border bg-muted/30"
          >
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={p.caption ?? 'Job photo'} className="w-full h-full object-cover" />
            </a>
            {p.caption && (
              <span
                className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                {p.caption}
              </span>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={deleting === p.id}
                aria-label="Delete photo"
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive disabled:opacity-50"
              >
                {deleting === p.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <X className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
