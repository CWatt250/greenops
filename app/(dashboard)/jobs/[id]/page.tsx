export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import { Edit, Calendar, Users, MapPin } from 'lucide-react';
import type { Job } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*, client:clients(*), crew:crews(*)')
    .eq('id', id)
    .single();

  if (error || !job) notFound();

  const j = job as Job & {
    client: { name: string; service_address: string } | null;
    crew: { name: string; color: string } | null;
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{j.title}</h1>
            <StatusBadge status={j.status} type="job" />
          </div>
        </div>
        <Link
          href={`/jobs/${id}/edit`}
          className={buttonVariants({ variant: 'outline' })}
        >
          <Edit className="h-4 w-4 mr-1.5" /> Edit
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        {j.scheduled_date && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{formatDate(j.scheduled_date)}</p>
              {(j.scheduled_start || j.scheduled_end) && (
                <p className="text-xs text-muted-foreground">
                  {j.scheduled_start?.slice(0, 5)} – {j.scheduled_end?.slice(0, 5)}
                </p>
              )}
            </div>
          </div>
        )}

        {j.client && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <Link href={`/clients/${j.client_id}`} className="text-sm font-medium hover:underline">
                {j.client.name}
              </Link>
              <p className="text-xs text-muted-foreground">{j.client.service_address}</p>
            </div>
          </div>
        )}

        {j.crew && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium">{j.crew.name}</p>
          </div>
        )}

        {j.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{j.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
