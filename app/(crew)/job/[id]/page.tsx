'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { enqueue } from '@/lib/offline-queue';
import { IssueFlagSheet } from '@/components/crew/issue-flag-sheet';
import { JobChemicalsSection } from '@/components/chemicals/job-chemicals-section';
import { distanceMeters } from '@/lib/geo';
import { JobFormsSection } from '@/components/forms/job-forms-section';
import {
  MapPin, Clock, ChevronLeft, Navigation, LogIn, LogOut,
  CheckSquare, AlertTriangle, FileText, Loader2, Ruler,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job, JobLineItem, ClockEvent } from '@/types';

type JobDetail = Job & {
  client: { id: string; name: string; service_address: string; phone?: string; latitude?: number | null; longitude?: number | null } | null;
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
  const [issueOpen, setIssueOpen] = useState(false);
  // Pre-job form gating state
  const [requiredPreJobIds, setRequiredPreJobIds] = useState<string[]>([]);
  const [submittedPreJobIds, setSubmittedPreJobIds] = useState<string[]>([]);
  // Geofence confirm state (migration 055)
  const [geofenceRadiusM, setGeofenceRadiusM] = useState(150);
  const [geoConfirm, setGeoConfirm] = useState<{ lat: number | null; lng: number | null; distance: number } | null>(null);
  const [geoReason, setGeoReason] = useState('');

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('companies')
      .select('geofence_radius_m')
      .eq('id', companyId)
      .single()
      .then(({ data }) => {
        if (typeof data?.geofence_radius_m === 'number') {
          setGeofenceRadiusM(data.geofence_radius_m);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Warm the completion route (RSC payload + chunks) so it still opens if
  // the crew loses signal between arriving on-site and finishing the job.
  useEffect(() => {
    router.prefetch(`/complete/${id}`);
  }, [id, router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const loadAll = useCallback(async () => {
    const [jobRes, lineRes, clockRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, client:clients(id,name,service_address,phone,latitude,longitude), crew:crews(name,color)')
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

    // Pre-job form gating: collect active pre_job templates that apply
    // to this job (no service_categories filter = applies-to-all, or
    // overlap with the job's service categories) and count submissions.
    const jobCompanyId = (jobRes.data as JobDetail | null)?.company_id;
    if (jobCompanyId) {
      const jobCategories = ((lineRes.data ?? []) as LineItemWithService[])
        .map((li) => li.service?.category as string | undefined)
        .filter((c): c is string => !!c);
      const [{ data: tplRows }, { data: subRows }] = await Promise.all([
        supabase
          .from('form_templates')
          .select('id, service_categories')
          .eq('company_id', jobCompanyId)
          .eq('is_active', true)
          .eq('trigger', 'pre_job'),
        supabase
          .from('form_submissions')
          .select('template_id')
          .eq('job_id', id),
      ]);
      const required = ((tplRows ?? []) as Array<{ id: string; service_categories: string[] | null }>)
        .filter((t) => {
          const cats = t.service_categories ?? [];
          return cats.length === 0 || cats.some((c) => (jobCategories as string[]).includes(c));
        })
        .map((t) => t.id);
      setRequiredPreJobIds(required);
      setSubmittedPreJobIds(
        ((subRows ?? []) as Array<{ template_id: string | null }>)
          .map((s) => s.template_id)
          .filter((x): x is string => !!x),
      );
    }

    setLoading(false);
  }, [id, supabase]);

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

    // Geofence (migration 055): compare the punch to the client's stored
    // coordinates. Out of range → confirm + reason, flagged for review on
    // the office timesheets page. Never a hard block: rural GPS drifts.
    const cLat = job?.client?.latitude;
    const cLng = job?.client?.longitude;
    let distance: number | null = null;
    if (lat !== null && lng !== null && typeof cLat === 'number' && typeof cLng === 'number') {
      distance = Math.round(distanceMeters(lat, lng, cLat, cLng) * 10) / 10;
    }
    if (distance !== null && distance > geofenceRadiusM) {
      setGeoConfirm({ lat, lng, distance });
      setGeoReason('');
      setClockLoading(false);
      return;
    }

    await performClockIn(lat, lng, distance, false, null);
  }

  async function performClockIn(
    lat: number | null,
    lng: number | null,
    distance: number | null,
    flagged: boolean,
    flagReason: string | null,
  ) {
    if (!userId || !companyId) return;
    setClockLoading(true);
    const promote = job?.status === 'scheduled' || job?.status === 'unscheduled';

    // Try the live write first. If we're offline (or any network failure),
    // queue the mutation in localStorage and replay on reconnect.
    const { error } = await supabase.from('clock_events').insert({
      company_id: companyId,
      job_id: id,
      profile_id: userId,
      event_type: 'clock_in',
      latitude: lat,
      longitude: lng,
      distance_from_site_m: distance,
      flagged,
      flag_reason: flagReason,
    });

    if (error) {
      enqueue({
        kind: 'clock_in',
        payload: {
          job_id: id,
          company_id: companyId,
          profile_id: userId,
          latitude: lat,
          longitude: lng,
          distance_from_site_m: distance,
          flagged,
          flag_reason: flagReason,
          promote_to_in_progress: promote,
        },
      });
      toast.success('Clock-in queued — will sync when you reconnect.');
    } else if (promote) {
      await supabase
        .from('jobs')
        .update({
          status: 'in_progress',
          actual_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
    setGeoConfirm(null);
    await loadAll();
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

  // Issue flagging now opens a Sheet that captures notes + photos before
  // flipping status. The Sheet handles its own write/queue logic.
  function openIssueSheet() {
    setIssueOpen(true);
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
        <Link href="/today" className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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

        {/* Geofence confirm — punch landed outside the site radius. */}
        {geoConfirm && (
          <div
            data-testid="geofence-confirm"
            className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-3 space-y-2"
          >
            <p className="text-sm font-semibold text-amber-800">
              You&apos;re {geoConfirm.distance >= 1000
                ? `${(geoConfirm.distance / 1609.34).toFixed(1)} mi`
                : `${Math.round(geoConfirm.distance)} m`} from {job.client?.name ?? 'the job site'}.
            </p>
            <p className="text-xs text-amber-700">
              You can still clock in — it&apos;ll be flagged for the office to review.
              A quick note helps (parked down the street, GPS acting up, …).
            </p>
            <Input
              value={geoReason}
              onChange={(e) => setGeoReason(e.target.value)}
              placeholder="Reason (optional)"
              className="h-9 text-sm bg-white"
            />
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  performClockIn(
                    geoConfirm.lat, geoConfirm.lng, geoConfirm.distance,
                    true, geoReason.trim() || null,
                  )}
                disabled={clockLoading}
                className="flex-1 h-10 gap-1.5 text-white"
                style={{ backgroundColor: '#d97706' }}
              >
                {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Clock In Anyway
              </Button>
              <Button
                variant="outline"
                onClick={() => setGeoConfirm(null)}
                disabled={clockLoading}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(() => {
          const missing = requiredPreJobIds.filter((id) => !submittedPreJobIds.includes(id));
          if (missing.length > 0 && !isClockedIn) {
            return (
              <div
                className="rounded-md border px-3 py-2 text-xs flex items-start gap-2"
                style={{ backgroundColor: 'var(--orange-soft)', borderColor: 'var(--orange)', color: 'var(--orange-deep)' }}
              >
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Complete <strong>{missing.length} pre-job form{missing.length === 1 ? '' : 's'}</strong> below before clocking in.
                </span>
              </div>
            );
          }
          return null;
        })()}

        <div className="flex gap-2">
          {!isClockedIn ? (
            <Button
              onClick={handleClockIn}
              disabled={
                clockLoading
                || job.status === 'complete'
                || job.status === 'cancelled'
                || requiredPreJobIds.some((id) => !submittedPreJobIds.includes(id))
              }
              className="h-12 flex-1 gap-2 text-base"
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
              className="h-12 flex-1 gap-2 text-base"
            >
              {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Clock Out
            </Button>
          )}

          {job.status !== 'complete' && job.status !== 'cancelled' && (
            <Button
              onClick={() => router.push(`/complete/${id}`)}
              disabled={!isClockedIn && job.status !== 'in_progress'}
              className="h-12 flex-1 gap-2 text-base"
              style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
            >
              <CheckSquare className="h-4 w-4" />
              Complete
            </Button>
          )}
        </div>

        {/* Quick-capture: jump into Measure with this client + address
         *  pre-filled. Useful when a customer asks for a re-measure or
         *  upsell during the visit. */}
        {job.client?.service_address && (
          <Link
            href={`/dashboard/measure?address=${encodeURIComponent(job.client.service_address)}&client_id=${job.client.id}`}
            className="flex min-h-11 items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--orange-deep)' }}
          >
            <Ruler className="h-3.5 w-3.5" />
            Measure this property
          </Link>
        )}

        {job.status !== 'complete' && job.status !== 'issue' && job.status !== 'cancelled' && (
          <button
            onClick={openIssueSheet}
            className="flex min-h-11 items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Flag an issue
          </button>
        )}

        {/* Chemicals — REI warning for this property + application logger. */}
        {job.client && userId && companyId && (
          <JobChemicalsSection
            clientId={job.client.id}
            jobId={id}
            companyId={companyId}
            userId={userId}
          />
        )}

        {userId && companyId && (
          <IssueFlagSheet
            open={issueOpen}
            onOpenChange={setIssueOpen}
            jobId={id}
            companyId={companyId}
            profileId={userId}
            onFlagged={() => loadAll()}
          />
        )}

        {/* Forms — pre-job, post-job, on-demand. Crews can fill them
         *  here without leaving the job page. */}
        {userId && companyId && (
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Forms</h2>
            </div>
            <JobFormsSection
              jobId={id}
              clientId={job.client?.id ?? null}
              companyId={companyId}
              userId={userId}
            />
          </div>
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
                    className="mt-0.5 inline-flex min-h-11 items-center text-xs text-blue-600 hover:underline"
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
