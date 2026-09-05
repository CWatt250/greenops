'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCompanyContext } from '@/lib/company-context';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downscaleImage } from '@/lib/image';

interface Props {
  companyId: string;
  jobId: string;
  /** Cap per batch. */
  max?: number;
}

/**
 * Office-side photo upload for a job (dashboard job detail). Anyone with
 * dashboard access — owner or dispatcher — can attach photos here; the crew's
 * completion flow is unchanged. Uploads land in the same `job-photos` bucket
 * and `job_photos` table the crew uses, so they display through the signed-URL
 * proxy like every other job photo.
 */
export function JobPhotosUploader({ companyId, jobId, max = 10 }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const ctx = await getCompanyContext(supabase);
    if (!ctx) {
      toast.error('Your session expired — please sign in again.');
      return;
    }

    setUploading(true);
    let ok = 0;
    for (const raw of files.slice(0, max)) {
      try {
        const file = await downscaleImage(raw);
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${companyId}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('job_photos').insert({
          company_id: companyId,
          job_id: jobId,
          uploaded_by: ctx.userId,
          storage_path: path,
          caption: 'Office',
        });
        if (insErr) throw insErr;
        ok += 1;
      } catch (err) {
        toast.error((err as Error).message ?? 'Photo upload failed.');
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(`${ok} photo${ok === 1 ? '' : 's'} added.`);
      router.refresh();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/50 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        Add photos
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePick}
      />
    </div>
  );
}
