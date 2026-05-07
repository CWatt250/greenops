'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import {
  MapPin, Clock, ChevronLeft, Navigation, LogIn, LogOut,
  CheckSquare, AlertTriangle, FileText, Loader2,
} from 'lucide-react';
import type { Job, JobLineItem, ClockEvent } from '@/types';

type JobDetail = Job & {
  client: { id: string; name: string; service_address: string; phone?: string } | null;
  crew: { name: string; color: string } | null;
};

type LineItemWithService = JobLineItem & {
  service: { name: string; category: string } | null;
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
    })
  );
}

export default function CrewJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [lineItems, setLineItems] = useState<LineItemWithService[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const loadAll = useCallback(async () => {
    const [jobRes, lineRes, clockRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, client:clients(id,name,service_address,phone), crew:crews(name,color)')
        .eq('id', id)
        .single(),
      supabase
        .from('job_line_items')
        .select('*, service:services(name,category)')
        .eq('job_id', id)
        .order('created_at'),
      supabase
        .from('clock_events')
        .select('*')
        .eq('job_id', id)
        .order('created_at'),
    ]);

    if (jobRes.data) {
      setJob(jobRes.data as JobDetail);
      setCompanyId((jobRes.data as JobDetail).company_id);
    }
    setLineItems((lineRes.data ?? []) as LineItemWithService[]);
    setClockEvents((clockRes.data ?? []) as ClockEvent[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Derive clock-in state for current user on this job
  const myEvents = clockEvents
    .filter((e) => e.profile_id === userId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const lastEvent = myEvents[myEvents.length - 1];
  const isClockedIn = lastEvent?.event_type === 'clock_in';

  async function handleClockIn() {
    if (!userId || !companyId) return;
    setClockLoading(true);
    setGpsError(null);

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      setGpsError('GPS unavailable — clocking in without location.');
    }

    const { error } = await supabase.from('clock_events').insert({
      company_id: companyId,
      job_id: id,
      profile_id: userId,
      event_type: 'clock_in',
      latitude: lat,
      longitude: lng,
    });

    if (!error) {
      // Promote job to in_progress on first clock-in
      if (job?.status === 'scheduled' || job?.status === 'unscheduled') {
        await supabase
          .from('jobs')
          .update({
            status: 'in_progress',
            actual_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
      await loadAll();
    }
    setClockLoading(false);
  }

  async function handleClockOut() {
    if (!userId || !companyId) return;
    setClockLoading(true);
    setGpsError(null);

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      setGpsError('GPS unavailable — clocking out without location.');
    }

    await supabase.from('clock_events').insert({
      company_id: companyId,
      job_id: id,
      profile_id: userId,
      event_type: 'clock_out',
      latitude: lat,
      longitude: lng,
    });

    await loadAll();
    setClockLoading(false);
  }

  async function handleFlagIssue() {
    await supabase
      .from('jobs')
      .update({ status: 'issue', updated_at: new Date().toISOString() })
      .eq('id', id);
    await loadAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return <p className="text-sm text-muted-foreground text-center py-16">Job not found.</p>;
  }

  const grandTotal = lineItems.reduce((s, li) => s + (li.total ?? 0), 0);

  return (
    <div className="space-y-5 pb-10">
      {/* Back */}
      <div>
        <Link href="/today" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Today
        </Link>
        <h1 className="text-xl font-bold mt-2 leading-tight">{job.title}</h1>
        <div className="mt-1.5">
          <StatusBadge status={job.status} type="job" />
        </div>
      </div>

      {/* GPS Clock-in panel */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Time Tracking
        </p>

        {gpsError && (
          <p className="text-xs text-amber-600">{gpsError}</p>
        )}

        <div className="flex gap-2">
          {!isClockedIn ? (
            <Button
              onClick={handleClockIn}
              disabled={clockLoading || job.status === 'complete' || job.status === 'cancelled'}
              className="flex-1 gap-2"
              style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
            >
              {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Clock In
            </Button>
          ) : (
            <Button
              onClick={handleClockOut}
              disabled={clockLoading}
              variant="outline"
              className="flex-1 gap-2"
            >
              {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Clock Out
            </Button>
          )}

          {job.status !== 'complete' && job.status !== 'cancelled' && (
            <Button
              onClick={() => router.push(`/complete/${id}`)}
              disabled={!isClockedIn && job.status !== 'in_progress'}
              className="flex-1 gap-2"
              style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
            >
              <CheckSquare className="h-4 w-4" />
              Complete
            </Button>
          )}
        </div>

        {job.status !== 'complete' && job.status !== 'issue' && job.status !== 'cancelled' && (
          <button
            onClick={handleFlagIssue}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Flag an issue
          </button>
        )}

        {/* Clock event history */}
        {myEvents.length > 0 && (
          <div className="pt-1 space-y-1">
            {myEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                {e.event_type === 'clock_in'
                  ? <LogIn className="h-3 w-3 text-green-600" />
                  : <LogOut className="h-3 w-3 text-amber-600" />}
                <span className="capitalize">{e.event_type.replace('_', ' ')}</span>
                <span>· {new Date(e.created_at).toLocaleTimeString()}</span>
                {e.latitude && (
                  <span className="text-muted-foreground/60">
                    · {e.latitude.toFixed(4)}, {e.longitude?.toFixed(4)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job details */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {job.client && (
          <>
            <div className="flex items-start gap-2.5">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{job.client.name}</p>
                <p className="text-xs text-muted-foreground">{job.client.service_address}</p>
                {job.client.phone && (
                  <a
                    href={`tel:${job.client.phone}`}
                    className="text-xs text-blue-600 hover:underline mt-0.5 block"
                  >
                    {job.client.phone}
                  </a>
                )}
              </div>
            </div>
            <Separator />
          </>
        )}

        {job.scheduled_start && (
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm">
              {(job.scheduled_start as string).slice(0, 5)}
              {job.scheduled_end && ` – ${(job.scheduled_end as string).slice(0, 5)}`}
            </p>
          </div>
        )}

        {job.notes && (
          <>
            <Separator />
            <div className="flex items-start gap-2.5">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </div>
          </>
        )}
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Services
          </p>
          <div className="space-y-2">
            {lineItems.map((li) => (
              <div key={li.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {li.description ?? li.service?.name ?? '—'}
                  </p>
                  {li.service?.category && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {li.service.category}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground tabular-nums shrink-0">×{li.quantity}</span>
                <span className="font-semibold tabular-nums shrink-0">
                  {formatCurrency(li.total ?? 0)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total</span>
              <span
                className="text-lg font-bold tabular-nums"
                style={{ color: 'var(--color-brand-green-raw)' }}
              >
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map deep-link */}
      {job.client?.service_address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(job.client.service_address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Navigation className="h-4 w-4" />
          Open in Maps
        </a>
      )}
    </div>
  );
}
