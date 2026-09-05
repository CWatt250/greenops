'use client';

import { useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { downscaleImage } from '@/lib/image';

export interface AttachedPhoto {
  id: string;
  url: string;
  storagePath: string;
  /** Local object URL for the in-form thumbnail — bucket-independent, so the
   *  preview works even when the storage bucket is private. Not persisted. */
  previewUrl?: string;
}

interface Props {
  /** Storage bucket name. Defaults to "job-photos" since RLS already
   *  permits authenticated uploads there. */
  bucket?: string;
  /** Object-key prefix. Use `${companyId}/portal/${type}/` so admin RLS
   *  for delete-by-prefix still works. */
  pathPrefix: string;
  /** Current photo list. Caller owns state so it can persist URLs on
   *  the parent form's submit. */
  photos: AttachedPhoto[];
  onChange: (next: AttachedPhoto[]) => void;
  /** Cap to keep mobile uploads sane. Defaults to 6. */
  max?: number;
}

/**
 * Lightweight photo capture used by portal forms (service requests + complaints).
 * Mirrors the /complete page's photo flow — sequential uploads, inline
 * thumbnails, X to remove.
 */
export function PhotoAttachInput({ bucket = 'job-photos', pathPrefix, photos, onChange, max = 6 }: Props) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = max - photos.length;
    if (remaining <= 0) {
      toast.error(`Up to ${max} photos.`);
      return;
    }
    const toUpload = await Promise.all(files.slice(0, remaining).map((f) => downscaleImage(f)));

    setUploading(true);
    const next = [...photos];
    for (const file of toUpload) {
      try {
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const safePrefix = pathPrefix.replace(/^\/+|\/+$/g, '');
        // eslint-disable-next-line react-hooks/purity -- inside an event handler, not render
        const path = `${safePrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase
          .storage
          .from(bucket)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        next.push({
          // eslint-disable-next-line react-hooks/purity -- inside an event handler, not render
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: pub.publicUrl,
          storagePath: path,
          previewUrl: URL.createObjectURL(file),
        });
      } catch (err) {
        toast.error((err as Error).message ?? 'Photo upload failed.');
      }
    }
    setUploading(false);
    onChange(next);
  }

  async function remove(p: AttachedPhoto) {
    if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    try {
      await supabase.storage.from(bucket).remove([p.storagePath]);
    } catch {
      // Ignore — even if the storage delete fails, drop the URL from
      // the parent's state so it's not submitted with the form.
    }
    onChange(photos.filter((x) => x.id !== p.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">
          Photos {photos.length > 0 && <span className="text-gray-400">({photos.length}/{max})</span>}
        </span>
        {photos.length < max && (
          <label className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-gray-50">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Add photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handlePick}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id} className="relative aspect-square rounded-lg overflow-hidden border bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl ?? p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
