export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GPSTracker } from '@/components/crew/gps-tracker';
import { CrewStatusBar } from '@/components/crew/crew-status-bar';
import { MorningBrief, type MorningBriefJob } from '@/components/crew/morning-brief';
import { JobCard, type JobCardClient } from '@/components/crew/job-card';
import { EndOfDay } from '@/components/crew/end-of-day';
import { TodayFocusScroller } from '@/components/crew/today-focus-scroller';
import { formatDate } from '@/lib/utils';
import { CalendarDays, CheckCircle2, Truck } from 'lucide-react';
import type { Job } from '@/types';

type CrewMembership = { crew_id: string; crew: { name: string; color: string } | null };
type JobWithClient = Job & { client: JobCardClient | null };

function todayDateStr(): string {
  // Local-date YYYY-MM-DD (not UTC) so the worker's "today" matches their
  // wall clock regardless of timezone.
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) {
    return (
      <div className="text-sm text-muted-foreground text-center py-16">
        No company linked to your account. Contact your dispatcher.
      </div>
    );
  }

  // Company depot for "Get Directions to HQ" + weather lookup.
  const { data: company } = await supabase
    .from('companies')
    .select('city, state, depot_latitude, depot_longitude, depot_address, address, weather_latitude, weather_longitude, weather_location_label')
    .eq('id', profile.company_id)
    .single();

  const today = todayDateStr();
  const dayStartIso = new Date(`${today}T00:00:00`).toISOString();
  const dayEndIso = new Date(`${today}T23:59:59.999`).toISOString();

  // Multi-crew memberships + per-crew member names for the brief.
  const { data: membershipsRaw } = await supabase
    .from('crew_members')
    .select('crew_id, crew:crews(name,color)')
    .eq('profile_id', user.id);

  const memberships = ((membershipsRaw ?? []) as unknown) as CrewMembership[];
  const crewIds = memberships.map((m) => m.crew_id);
  const crewById = new Map<string, { name: string; color: string }>();
  for (const m of memberships) {
    if (m.crew && m.crew_id) crewById.set(m.crew_id, m.crew);
  }

  let crewSummaries: Array<{ name: string; color: string; member_names: string[] }> = [];
  if (crewIds.length > 0) {
    const { data: peersRaw } = await supabase
      .from('crew_members')
      .select('crew_id, profile:profiles(id, full_name)')
      .in('crew_id', crewIds);
    const peers = ((peersRaw ?? []) as unknown) as Array<{
      crew_id: string;
      profile: { id: string; full_name: string | null } | null;
    }>;
    crewSummaries = memberships
      .filter((m) => !!m.crew)
      .map((m) => ({
        name: m.crew!.name,
        color: m.crew!.color,
        member_names: peers
          .filter((p) => p.crew_id === m.crew_id && p.profile?.id !== user.id && p.profile?.full_name)
          .map((p) => p.profile!.full_name as string),
      }));
  }

  // A worker with no crew membership has no day to show — render a clear
  // "talk to your dispatcher" state rather than querying. (Skipping the crew
  // filter here used to return EVERY company job for the date.)
  if (crewIds.length === 0) {
    return (
      <div className="space-y-5 pb-8">
        <CrewStatusBar todayLabel={formatDate(today)} />
        <section className="rounded-2xl border bg-card px-5 py-14 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold mt-3">You&apos;re not assigned to a crew yet</h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            Contact your dispatcher to get added to a crew — your jobs will
            show up here as soon as you&apos;re on one.
          </p>
        </section>
      </div>
    );
  }

  // Jobs for today, scoped to the worker's crews. Drive order if present,
  // else fall back to scheduled_start.
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      *,
      client:clients(
        id, name, service_address, service_city, service_state, service_zip,
        latitude, longitude, phone, access_notes, gate_code
      )
    `)
    .eq('company_id', profile.company_id)
    .eq('scheduled_date', today)
    .not('status', 'in', '("cancelled")')
    .in('crew_id', crewIds)
    .order('route_order', { ascending: true, nullsFirst: false })
    .order('scheduled_start', { ascending: true, nullsFirst: false });
  const todayJobs = (jobs ?? []) as JobWithClient[];

  // Shift state from clock_events (migration 038 expanded the check).
  const { data: shiftEventsRaw } = await supabase
    .from('clock_events')
    .select('event_type, created_at, latitude, longitude')
    .eq('profile_id', user.id)
    .in('event_type', ['shift_start', 'shift_end'])
    .gte('created_at', dayStartIso)
    .lte('created_at', dayEndIso)
    .order('created_at');

  const shiftEvents = (shiftEventsRaw ?? []) as Array<{
    event_type: 'shift_start' | 'shift_end';
    created_at: string;
  }>;
  const lastShiftEvent = shiftEvents[shiftEvents.length - 1] ?? null;
  const shiftStartedAt = shiftEvents.find((e) => e.event_type === 'shift_start')?.created_at ?? null;
  const isClockedOutForDay = lastShiftEvent?.event_type === 'shift_end';
  const isClockedInForDay = lastShiftEvent?.event_type === 'shift_start';

  // Completion stats for the end-of-day card (only the worker's own work).
  const done = todayJobs.filter((j) => j.status === 'complete');
  const active = todayJobs.find((j) => j.status === 'en_route' || j.status === 'in_progress');
  const remaining = todayJobs.filter(
    (j) => j.status !== 'complete' && j.status !== 'cancelled'
  );
  const inProgress = todayJobs.filter((j) => j.status === 'in_progress');

  const allDone = todayJobs.length > 0 && remaining.length === 0;

  // Decide phase.
  // Morning Brief shows when: NOT clocked in for day, and the worker hasn't
  // already finished. Also: after 5pm with nothing done — surface the
  // "late start" copy variant.
  const hourLocal = new Date().getHours();
  const lateStart = !isClockedInForDay && done.length === 0 && hourLocal >= 17;
  const showMorningBrief = !isClockedInForDay && !isClockedOutForDay && !allDone;
  const showEndOfDay = (allDone || isClockedInForDay) && !isClockedOutForDay && allDone;
  const showClockedOutSummary = isClockedOutForDay;

  // Stats for the end-of-day card.
  let endOfDayStats: {
    jobs_completed: number;
    jobs_total: number;
    worked_minutes: number;
    drive_minutes: number;
    drive_miles: number;
    photos_count: number;
    signatures_count: number;
    measurements_count: number;
  } | null = null;

  if (showEndOfDay || showClockedOutSummary) {
    const jobIds = todayJobs.map((j) => j.id);
    const [photosRes, sigCount, measurementsRes] = await Promise.all([
      jobIds.length > 0
        ? supabase
            .from('job_photos')
            .select('id', { count: 'exact', head: true })
            .in('job_id', jobIds)
            .eq('uploaded_by', user.id)
        : Promise.resolve({ count: 0 } as { count: number }),
      Promise.resolve(done.filter((j) => !!j.signature_url).length),
      supabase
        .from('property_measurements')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by_profile_id', user.id)
        .gte('created_at', dayStartIso)
        .lte('created_at', dayEndIso),
    ]);

    const driveMinutes = done.reduce(
      (s, j) => s + Math.max(0, j.drive_minutes_from_previous ?? 0),
      0,
    );
    const driveMiles = done.reduce(
      (s, j) => s + Math.max(0, j.drive_distance_miles_from_previous ?? 0),
      0,
    );

    // Worked minutes: sum (actual_end - actual_start) across completed jobs.
    let workedMinutes = 0;
    for (const j of done) {
      if (j.actual_start && j.actual_end) {
        const ms = new Date(j.actual_end).getTime() - new Date(j.actual_start).getTime();
        if (ms > 0) workedMinutes += Math.round(ms / 60_000);
      }
    }

    endOfDayStats = {
      jobs_completed: done.length,
      jobs_total: todayJobs.length,
      worked_minutes: workedMinutes,
      drive_minutes: driveMinutes,
      drive_miles: Math.round(driveMiles * 10) / 10,
      photos_count: (photosRes as { count: number | null }).count ?? 0,
      signatures_count: sigCount,
      measurements_count: (measurementsRes as { count: number | null }).count ?? 0,
    };
  }

  // Active stop = first remaining job (drive-ordered). Currently in-progress
  // takes priority — if a worker is mid-job we don't "skip ahead" to the
  // next stop's Get Directions button.
  const activeStopId = inProgress[0]?.id ?? remaining[0]?.id ?? null;

  return (
    <div className="space-y-5 pb-8">
      <CrewStatusBar todayLabel={formatDate(today)} />

      <GPSTracker
        profileId={user.id}
        crewId={crewIds[0] ?? null}
        companyId={profile.company_id}
        isActive={inProgress.length > 0}
      />

      <Suspense fallback={null}>
        <TodayFocusScroller />
      </Suspense>

      {/* PHASE 1: Morning Brief */}
      {showMorningBrief && (
        <MorningBrief
          profileId={user.id}
          companyId={profile.company_id}
          workerName={profile.full_name ?? ''}
          todayDate={today}
          weather={{
            lat: company?.weather_latitude ?? company?.depot_latitude ?? null,
            lng: company?.weather_longitude ?? company?.depot_longitude ?? null,
            city: company?.weather_location_label
              ?? [company?.city, company?.state].filter(Boolean).join(', ')
              ?? null,
          }}
          jobs={todayJobs as unknown as MorningBriefJob[]}
          crews={crewSummaries}
          lateStart={lateStart}
        />
      )}

      {/* PHASE 4: Already clocked out — short "see you tomorrow" line */}
      {showClockedOutSummary && (
        <section className="rounded-2xl border bg-card px-5 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
          <h2 className="text-lg font-bold mt-3">Day complete. See you tomorrow!</h2>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(today)}</p>
          {endOfDayStats && (
            <p className="text-xs text-muted-foreground mt-3">
              {endOfDayStats.jobs_completed} job{endOfDayStats.jobs_completed === 1 ? '' : 's'} · {Math.round(endOfDayStats.worked_minutes / 60 * 10) / 10}h worked
            </p>
          )}
        </section>
      )}

      {/* PHASE 3: End-of-day card */}
      {showEndOfDay && endOfDayStats && !isClockedOutForDay && (
        <EndOfDay
          profileId={user.id}
          companyId={profile.company_id}
          workerName={profile.full_name ?? ''}
          todayDate={today}
          stats={endOfDayStats}
          shiftStartAt={shiftStartedAt}
          depot={{
            lat: company?.depot_latitude ?? null,
            lng: company?.depot_longitude ?? null,
            address: company?.depot_address
              ?? [company?.address, company?.city, company?.state].filter(Boolean).join(', ')
              ?? null,
          }}
        />
      )}

      {/* PHASE 2: Drive-ordered schedule (only when clocked in and there's still work). */}
      {isClockedInForDay && !allDone && (
        <>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-bold leading-none">Today's Schedule</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(today)}</p>
            </div>
          </div>

          {todayJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
              <p className="text-sm text-muted-foreground">No jobs scheduled for today.</p>
              <p className="text-xs text-muted-foreground mt-1">Check back later or contact your dispatcher.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <Truck className="h-3 w-3" /> Depart HQ
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-3">
                {todayJobs.map((job, i) => {
                  const totalStops = todayJobs.length;
                  const stopNumber = i + 1;
                  const isActive = job.id === activeStopId;
                  const chip = memberships.length > 1 && job.crew_id
                    ? crewById.get(job.crew_id) ?? null
                    : null;
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      stopNumber={stopNumber}
                      totalStops={totalStops}
                      fromLabel={i === 0 ? 'hq' : 'previous'}
                      isActive={isActive}
                      crewChip={chip}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
