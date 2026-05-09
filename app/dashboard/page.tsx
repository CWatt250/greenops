export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageIntro } from '@/components/help/page-intro';
import { AnnounceButton } from '@/components/dashboard/announce-button';
import { HeroGreeting } from '@/components/dashboard/hero-greeting';
import { StatCardWithSparkline } from '@/components/dashboard/stat-card-with-sparkline';
import { TodaysRunTable, type TodaysRunJob } from '@/components/dashboard/todays-run-table';
import { CrewPerformanceBars, type CrewPerformanceRow } from '@/components/dashboard/crew-performance-bars';
import { PortalInboxCard, type PortalInboxItem } from '@/components/dashboard/portal-inbox-card';
import { WeatherWatch } from '@/components/dashboard/weather-watch';
import { QuickActionsGrid } from '@/components/dashboard/quick-actions-grid';
import { buttonVariants } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { getDashboardWeather } from '@/lib/weather';
import { formatCurrency } from '@/lib/utils';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, company_id, company:companies(*)')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'crew') redirect('/today');
  if (profile?.role === 'customer') redirect('/portal');

  const companyId = (profile as { company_id?: string } | null)?.company_id;
  const company = (profile as { company?: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    weather_location_label?: string | null;
    weather_latitude?: number | null;
    weather_longitude?: number | null;
    weather_forecast_days?: number | null;
    weather_units?: 'imperial' | 'metric' | null;
    weather_show_on_dashboard?: boolean | null;
  } | null } | null)?.company;

  const fullName = (profile as { full_name?: string } | null)?.full_name ?? '';
  const firstName = fullName.split(' ')[0] || (user.email?.split('@')[0] ?? 'there');

  const todayStr = toDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  // 7-day window for the today's-jobs sparkline.
  const last7Start = new Date();
  last7Start.setDate(last7Start.getDate() - 6);
  const last7StartStr = toDateStr(last7Start);

  // MTD window for revenue.
  const monthStart = startOfMonth(new Date());
  const monthStartStr = toDateStr(monthStart);

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const [
    todayJobsRes,
    yesterdayCountRes,
    last7JobsRes,
    crewsRes,
    paidThisMonthRes,
    invoicesOpenRes,
    requestsRes,
    complaintsRes,
    messagesRes,
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        'id, title, status, scheduled_start, scheduled_end, ' +
        'client:clients(id,name,service_address), ' +
        'crew:crews(id,name,color)'
      )
      .eq('scheduled_date', todayStr)
      .order('scheduled_start', { nullsFirst: false }),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('scheduled_date', yesterdayStr),
    supabase
      .from('jobs')
      .select('scheduled_date')
      .gte('scheduled_date', last7StartStr)
      .lte('scheduled_date', todayStr),
    supabase
      .from('crews')
      .select('id, name, color')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('payments')
      .select('amount, payment_date')
      .gte('payment_date', monthStartStr)
      .lte('payment_date', todayStr),
    supabase
      .from('invoices')
      .select('id, balance_due, due_date, status')
      .gt('balance_due', 0)
      .not('status', 'in', '("paid","cancelled","draft")'),
    supabase
      .from('service_requests')
      .select('id, title, description, created_at, status, client:clients(name)')
      .eq('company_id', companyId ?? '')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('complaints')
      .select('id, title, description, created_at, status, severity, client:clients(name)')
      .eq('company_id', companyId ?? '')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('messages')
      .select('id, body, created_at, sender_type, client:clients(name)')
      .eq('sender_type', 'portal_user')
      .eq('company_id', companyId ?? '')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // ── Today's run table ─────────────────────────────────────────────────────
  const todaysJobs = ((todayJobsRes.data ?? []) as unknown as TodaysRunJob[]);
  const todayCount = todaysJobs.length;
  const completedToday = todaysJobs.filter((j) => j.status === 'complete').length;
  const inProgressToday = todaysJobs.filter((j) => j.status === 'in_progress').length;
  const issueToday = todaysJobs.filter((j) => j.status === 'issue').length;

  // ── Today's-jobs sparkline (7 days) ───────────────────────────────────────
  const dayCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayCounts.set(toDateStr(d), 0);
  }
  for (const row of (last7JobsRes.data ?? []) as { scheduled_date: string }[]) {
    if (dayCounts.has(row.scheduled_date)) {
      dayCounts.set(row.scheduled_date, (dayCounts.get(row.scheduled_date) ?? 0) + 1);
    }
  }
  const todayJobsSpark = Array.from(dayCounts.values());

  const yesterdayCount = yesterdayCountRes.count ?? 0;
  const todayDelta = todayCount - yesterdayCount;
  const todayDeltaStr =
    todayDelta === 0 ? null : `${todayDelta > 0 ? '+' : ''}${todayDelta}`;

  // ── Revenue MTD ───────────────────────────────────────────────────────────
  const paidRows = (paidThisMonthRes.data ?? []) as { amount: number; payment_date: string }[];
  const revenueMTD = paidRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  // Daily series for the sparkline.
  const dayRevenue = new Map<string, number>();
  const cursor = new Date(monthStart);
  while (cursor <= new Date()) {
    dayRevenue.set(toDateStr(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const r of paidRows) {
    if (dayRevenue.has(r.payment_date)) {
      dayRevenue.set(r.payment_date, (dayRevenue.get(r.payment_date) ?? 0) + Number(r.amount ?? 0));
    }
  }
  // Cumulative for a smooth growth curve.
  let running = 0;
  const revSpark = Array.from(dayRevenue.values()).map((v) => (running += v));

  // ── Outstanding ──────────────────────────────────────────────────────────
  const openInvoices = (invoicesOpenRes.data ?? []) as { id: string; balance_due: number; due_date: string | null; status: string }[];
  const outstandingTotal = openInvoices.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const outstandingCount = openInvoices.length;
  const overdueCount = openInvoices.filter(
    (i) => i.status === 'overdue'
      || (i.due_date && new Date(i.due_date) < new Date())
  ).length;

  // ── Crews out / on-schedule ───────────────────────────────────────────────
  const allCrews = (crewsRes.data ?? []) as { id: string; name: string; color: string }[];
  const crewsTotal = allCrews.length;
  // "Crews out" = crews with at least one job scheduled today.
  const crewsWithJobsToday = new Set(
    todaysJobs.filter((j) => j.crew?.id).map((j) => j.crew!.id),
  );
  const crewsOut = crewsWithJobsToday.size;
  const onScheduleCount = todaysJobs.filter(
    (j) => j.status === 'complete' || j.status === 'in_progress' || j.status === 'scheduled',
  ).length;
  const onSchedulePct = todayCount > 0
    ? Math.round((onScheduleCount / todayCount) * 100)
    : 100;

  // Build per-crew performance rows from today's jobs.
  const perfRows: CrewPerformanceRow[] = allCrews.map((c) => {
    const crewJobs = todaysJobs.filter((j) => j.crew?.id === c.id);
    const completed = crewJobs.filter((j) => j.status === 'complete').length;
    const onTime = crewJobs.length > 0
      ? Math.round((crewJobs.filter((j) => j.status !== 'issue').length / crewJobs.length) * 100)
      : null;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      scheduled: crewJobs.length,
      completed,
      onTimePct: onTime,
    };
  });

  // ── Portal inbox ─────────────────────────────────────────────────────────
  type RawClient = { name: string };
  type RawRequest = { id: string; title: string; description: string | null; created_at: string; client: RawClient | null };
  type RawComplaint = { id: string; title: string; created_at: string; client: RawClient | null };
  type RawMessage = { id: string; body: string; created_at: string; client: RawClient | null };

  const requests = (requestsRes.data ?? []) as unknown as RawRequest[];
  const complaints = (complaintsRes.data ?? []) as unknown as RawComplaint[];
  const portalMessages = (messagesRes.data ?? []) as unknown as RawMessage[];

  const inboxItems: PortalInboxItem[] = [
    ...requests.map((r) => ({
      id: r.id,
      kind: 'request' as const,
      client: r.client?.name ?? 'Customer',
      preview: r.title,
      relativeTime: relativeTime(r.created_at),
      href: '/dashboard/portal-admin/requests',
      _ts: new Date(r.created_at).getTime(),
    })),
    ...complaints.map((c) => ({
      id: c.id,
      kind: 'complaint' as const,
      client: c.client?.name ?? 'Customer',
      preview: c.title,
      relativeTime: relativeTime(c.created_at),
      href: '/dashboard/portal-admin/complaints',
      _ts: new Date(c.created_at).getTime(),
    })),
    ...portalMessages.map((m) => ({
      id: m.id,
      kind: 'message' as const,
      client: m.client?.name ?? 'Customer',
      preview: m.body.slice(0, 80),
      relativeTime: relativeTime(m.created_at),
      href: '/dashboard/portal-admin',
      _ts: new Date(m.created_at).getTime(),
    })),
  ]
    .sort((a, b) => b._ts - a._ts)
    .slice(0, 5)
    .map(({ _ts, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars

  // ── Weather ───────────────────────────────────────────────────────────────
  const weatherEnabled = company?.weather_show_on_dashboard !== false; // default true
  const weatherDays = company?.weather_forecast_days ?? 3;
  const weatherUnits = company?.weather_units ?? 'imperial';
  const weatherLat = company?.weather_latitude;
  const weatherLng = company?.weather_longitude;
  const weatherLabel = company?.weather_location_label
    ?? (company?.city ? [company.city, company.state].filter(Boolean).join(', ') : undefined);

  const weather = weatherEnabled
    ? (typeof weatherLat === 'number' && typeof weatherLng === 'number'
        ? await getDashboardWeather(
            { lat: Number(weatherLat), lng: Number(weatherLng) },
            { days: weatherDays, units: weatherUnits, locationLabel: weatherLabel },
          )
        : company?.city
          ? await getDashboardWeather(
              { city: company.city, state: company.state ?? undefined },
              { days: weatherDays, units: weatherUnits, locationLabel: weatherLabel },
            )
          : await getDashboardWeather(
              { lat: 46.2087, lng: -119.1734 },
              { days: weatherDays, units: weatherUnits, locationLabel: weatherLabel ?? 'Tri-Cities, WA' },
            ))
    : null;

  // Count jobs falling on rainy days inside the forecast window.
  const futureJobsByDate: Record<string, number> = {};
  if (weather && weather.forecast.length > 0) {
    const dates = weather.forecast.map((d) => d.date);
    const { data: futureJobs } = await supabase
      .from('jobs')
      .select('scheduled_date')
      .in('scheduled_date', dates);
    for (const j of (futureJobs ?? []) as { scheduled_date: string }[]) {
      futureJobsByDate[j.scheduled_date] = (futureJobsByDate[j.scheduled_date] ?? 0) + 1;
    }
  }

  return (
    <div>
      {/* Hero greeting */}
      <div className="flex items-end justify-between gap-6 mb-8 pb-5 border-b">
        <HeroGreeting
          firstName={firstName}
          jobsToday={todayCount}
          crewsActive={crewsTotal}
          city={company?.city ?? null}
          weather={weather?.today
            ? { temp: weather.today.temp, unitSymbol: weather.today.unitSymbol, condition: weather.today.condition }
            : null}
        />
        <div className="flex items-center gap-2 shrink-0">
          {companyId && <AnnounceButton companyId={companyId} />}
          <Link
            href="/dashboard/analytics"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Link>
          <Link
            href="/dashboard/jobs/new"
            className={buttonVariants()}
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New Job
          </Link>
        </div>
      </div>

      <PageIntro
        id="dashboard"
        title="Your daily command center"
        description="Today's stats, jobs in flight, weather, and customer messages — all in one screen. Click any card to drill in."
        steps={[
          'Hero stats compare today vs yesterday and trend the last 7 days.',
          'Today\'s Run is a live table — click any row to open the job.',
          'Weather Watch flags rain risk and the jobs that may need to push.',
        ]}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCardWithSparkline
          label="Today's jobs"
          value={todayCount}
          delta={todayDeltaStr}
          foot={`${completedToday} done · ${inProgressToday} active${issueToday > 0 ? ` · ${issueToday} issue` : ''}`}
          spark={todayJobsSpark}
        />
        <StatCardWithSparkline
          label="Revenue MTD"
          value={formatCurrency(revenueMTD)}
          foot={`${paidRows.length} payment${paidRows.length === 1 ? '' : 's'} this month`}
          spark={revSpark}
        />
        <StatCardWithSparkline
          label="Outstanding"
          value={formatCurrency(outstandingTotal)}
          foot={`${outstandingCount} invoice${outstandingCount === 1 ? '' : 's'}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
          color={overdueCount > 0 ? '#EF4444' : 'var(--orange)'}
        />
        <StatCardWithSparkline
          label="Crews out"
          value={`${crewsOut} / ${crewsTotal}`}
          foot={todayCount > 0 ? `${onSchedulePct}% on schedule` : 'No jobs today'}
        />
      </div>

      {/* Two-column main */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <TodaysRunTable jobs={todaysJobs.slice(0, 8)} />
          <CrewPerformanceBars rows={perfRows} />
        </div>
        <div className="flex flex-col gap-4">
          <PortalInboxCard items={inboxItems} />
          {weather && (
            <WeatherWatch
              forecast={weather.forecast}
              affectedJobsByDate={futureJobsByDate}
              ok={weather.ok}
              locationLabel={weather.locationLabel}
            />
          )}
        </div>
      </div>

      {/* Quick actions */}
      <QuickActionsGrid />
    </div>
  );
}
