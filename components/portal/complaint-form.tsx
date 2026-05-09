'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhotoAttachInput, type AttachedPhoto } from '@/components/portal/photo-attach-input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplaintSeverity, Job } from '@/types';

const SEVERITIES: Array<{ value: ComplaintSeverity; label: string; color: string }> = [
  { value: 'low', label: '🟢 Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: '🟡 Medium', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: '🔴 High', color: 'bg-red-100 text-red-700' },
];

interface Props {
  clientId: string;
  companyId: string;
  portalUserId: string;
  recentJobs: Pick<Job, 'id' | 'title' | 'scheduled_date'>[];
}

export function ComplaintForm({ clientId, companyId, portalUserId, recentJobs }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [jobId, setJobId] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<ComplaintSeverity>('medium');
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Please enter a title.'); return; }
    if (!description.trim()) { toast.error('Please describe the issue.'); return; }

    setSubmitting(true);

    const { data: complaint, error } = await supabase
      .from('complaints')
      .insert({
        company_id: companyId,
        client_id: clientId,
        portal_user_id: portalUserId,
        job_id: jobId || null,
        title: title.trim(),
        description: description.trim(),
        severity,
        photo_urls: photos.length > 0 ? photos.map((p) => p.url) : null,
      })
      .select('id')
      .single();

    if (error) { toast.error(error.message); setSubmitting(false); return; }

    // Notify admins (urgent for high severity)
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .in('role', ['owner', 'dispatcher']);

    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map((a: { id: string }) => ({
          company_id: companyId,
          profile_id: a.id,
          title: `${severity === 'high' ? '🚨 HIGH PRIORITY — ' : ''}New complaint: ${title}`,
          body: description.slice(0, 80),
          entity_type: 'complaint',
          entity_id: complaint?.id,
        }))
      );
    }

    toast.success('Issue reported. We\'ll be in touch shortly.');
    router.push('/portal/complaints');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label className="text-xs mb-1 block text-gray-600">Issue Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of the issue"
          className="rounded-xl bg-white border-gray-200"
          required
        />
      </div>

      {recentJobs.length > 0 && (
        <div>
          <Label className="text-xs mb-1 block text-gray-600">Related Job (optional)</Label>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setJobId('')}
              className={cn(
                'w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors',
                !jobId ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600'
              )}
              style={!jobId ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
            >
              Not related to a specific job
            </button>
            {recentJobs.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setJobId(j.id)}
                className={cn(
                  'w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors',
                  jobId === j.id ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600'
                )}
                style={jobId === j.id ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
              >
                {j.title}
                {j.scheduled_date && <span className="ml-2 opacity-70 text-xs">· {j.scheduled_date}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs mb-1 block text-gray-600">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe the issue in detail…"
          rows={4}
          className="rounded-xl bg-white border-gray-200 resize-none"
          required
        />
      </div>

      <PhotoAttachInput
        pathPrefix={`${companyId}/portal/complaints`}
        photos={photos}
        onChange={setPhotos}
      />

      <div>
        <Label className="text-xs mb-2 block text-gray-600">Severity</Label>
        <div className="flex gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSeverity(s.value)}
              className={cn(
                'flex-1 rounded-xl border-2 py-2.5 text-sm font-medium transition-all',
                severity === s.value
                  ? 'border-transparent text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-600'
              )}
              style={severity === s.value ? {
                backgroundColor: s.value === 'high' ? '#EF4444' : s.value === 'medium' ? '#F59E0B' : '#22C55E',
              } : {}}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-12 rounded-xl font-semibold gap-2"
        style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit Report
      </Button>
    </form>
  );
}
