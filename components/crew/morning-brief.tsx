'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Sun, CloudSun, CloudRain, Cloud, Wind, Snowflake, Zap,
  Users, Clock, Truck, Briefcase, MapPin, Info, Loader2, Play,
} from 'lucide-react';
import type { Job } from '@/types';

export interface MorningBriefJob
  extends Pick<Job, 'id' | 'status' | 'scheduled_start' | 'notes' | 'issue_notes' | 'drive_minutes_from_previous'> {
  title: string;
  client?: {
    name: string;
    service_address?: string | null;
    access_notes?: string | null;
    gate_code?: string | null;
  } | null;
}

interface CrewSummary {
  name: string;
  color: string;
  member_names: string[];
}

interface Props {
  profileId: string;
  companyId: string;
  workerName: string;
  todayDate: string; // YYYY-MM-DD
  /** ISO city/state for the OWM lookup. */
  weather: { lat: number | null; lng: number | null; city: string | null };
  /** Today's jobs in drive-optimal order. */
  jobs: MorningBriefJob[];
  /** One entry per crew the worker is on. */
  crews: CrewSummary[];
  /** True when called after 5pm with no completed jobs (copy adjusts). */
  lateStart: boolean;
}

interface WeatherSnapshot {
  temp: number;
  description: string;
  main: string;
}

function weatherIcon(main: string) {
  switch (main) {
    case 'Clear':        return <Sun className="h-6 w-6" />;
    case 'Clouds':       return <CloudSun className="h-6 w-6" />;
    case 'Rain':
    case 'Drizzle':      return <CloudRain className="h-6 w-6" />;
    case 'Thunderstorm': return <Zap className="h-6 w-6" />;
    case 'Snow':         return <Snowflake className="h-6 w-6" />;
    case 'Mist':
    case 'Fog':
    case 'Haze':         return <Cloud className="h-6 w-6" />;
    default:             return <Wind className="h-6 w-6" />;
  }
}

function greetingFor(hour: number, name: string, lateStart: boolean): string {
  const firstName = name.split(' ')[0] || '';
  const suffix = firstName ? `, ${firstName}` : '';
  if (lateStart) return `Hey${suffix}`;
  if (hour < 12) return `Good morning${suffix}`;
  if (hour < 17) return `Good afternoon${suffix}`;
  return `Good evening${suffix}`;
}

function formatTime(t?: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (!Number.isFinite(h)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function subtractMinutesFromHHMM(hhmm: string, mins: number): string | null {
  const [hStr, mStr] = hhmm.split(':');
  const total = Number(hStr) * 60 + Number(mStr ?? 0) - mins;
  if (!Number.isFinite(total) || total < 0) return null;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return formatTime(`${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
}

function getPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function MorningBrief({
  profileId,
  companyId,
  workerName,
  todayDate,
  weather,
  jobs,
  crews,
  lateStart,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hour = useMemo(() => new Date().getHours(), []);
  const greeting = greetingFor(hour, workerName, lateStart);

  const dateLabel = useMemo(() => {
    return new Date(`${todayDate}T12:00`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }, [todayDate]);

  // Quick stats
  const firstJob = jobs[0];
  const firstStopLabel = firstJob ? formatTime(firstJob.scheduled_start) : null;
  const firstStopClient = firstJob?.client?.name ?? null;
  const totalDriveMin = jobs.reduce(
    (sum, j) => sum + Math.max(0, j.drive_minutes_from_previous ?? 0),
    0,
  );
  const totalWorkMin = Math.max(jobs.length * 30, 0); // 30m placeholder when est. duration not on the row

  // Depart-HQ time = first job's scheduled_start MINUS its drive_minutes_from_previous
  // (which, for stop #1 in drive order, is HQ → first stop).
  const departHQ = (() => {
    if (!firstJob?.scheduled_start) return null;
    const driveFromHQ = firstJob.drive_minutes_from_previous ?? 0;
    return subtractMinutesFromHHMM(firstJob.scheduled_start, driveFromHQ);
  })();

  // Heads-up flags from notes + customer access fields
  const headsUp: string[] = [];
  for (const j of jobs) {
    if (j.notes) headsUp.push(`${j.client?.name ?? j.title}: ${j.notes}`);
    if (j.issue_notes) headsUp.push(`${j.client?.name ?? j.title}: ${j.issue_notes}`);
    if (j.client?.access_notes) headsUp.push(`${j.client.name}: ${j.client.access_notes}`);
    if (j.client?.gate_code) headsUp.push(`${j.client.name}: gate code ${j.client.gate_code}`);
  }

  // Live weather fetch (client-side, public OWM key).
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_OWM_KEY;
    if (!key) return;
    let cancelled = false;
    async function load() {
      try {
        let url: string;
        if (Number.isFinite(weather.lat) && Number.isFinite(weather.lng)) {
          url = `https://api.openweathermap.org/data/2.5/weather?lat=${weather.lat}&lon=${weather.lng}&units=imperial&appid=${key}`;
        } else if (weather.city) {
          url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(weather.city)}&units=imperial&appid=${key}`;
        } else {
          return;
        }
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const w = data?.weather?.[0];
        if (data?.main && w) {
          setSnapshot({
            temp: Math.round(data.main.temp),
            description: w.description ?? w.main ?? '',
            main: w.main ?? 'Clear',
          });
        }
      } catch {}
    }
    void load();
    return () => { cancelled = true; };
  }, [weather.lat, weather.lng, weather.city]);

  async function handleStartMyDay() {
    setStarting(true);
    setError(null);

    const pos = await getPosition();
    const payload = {
      company_id: companyId,
      profile_id: profileId,
      event_type: 'shift_start' as const,
      latitude: pos?.coords.latitude ?? null,
      longitude: pos?.coords.longitude ?? null,
      job_id: null,
    };

    const { error: insertErr } = await supabase.from('clock_events').insert(payload);
    if (insertErr) {
      setError(insertErr.message);
      setStarting(false);
      return;
    }

    router.refresh();
  }

  return (
    <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Header — greeting + weather */}
      <div
        className="px-5 pt-5 pb-4 border-b"
        style={{ backgroundImage: 'linear-gradient(160deg, var(--color-brand-dark-raw, #1C2B1A) 0%, var(--color-brand-green-raw, #3D6B2C) 100%)', color: 'white' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{greeting}</h1>
            <p className="text-xs opacity-80 mt-0.5">{dateLabel}</p>
          </div>
          {snapshot ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className="opacity-90">{weatherIcon(snapshot.main)}</div>
              <div className="text-right leading-tight">
                <p className="text-xl font-bold tabular-nums">{snapshot.temp}°</p>
                <p className="text-[10px] opacity-80 capitalize">{snapshot.description}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="px-5 py-4 space-y-3">
        {lateStart && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            Looks like today didn&rsquo;t get started yet. Want to begin?
          </div>
        )}

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs scheduled for today. Enjoy the breather.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <Stat icon={<Briefcase className="h-3.5 w-3.5" />} label="Jobs scheduled" value={`${jobs.length}`} />
            <Stat
              icon={<Clock className="h-3.5 w-3.5" />}
              label="First stop"
              value={firstStopLabel ? `${firstStopLabel}${firstStopClient ? ` · ${firstStopClient}` : ''}` : '—'}
            />
            <Stat icon={<Truck className="h-3.5 w-3.5" />} label="Total drive" value={`~${totalDriveMin} min`} />
            <Stat icon={<Briefcase className="h-3.5 w-3.5" />} label="Total work" value={`~${Math.round(totalWorkMin / 60 * 10) / 10}h`} />
          </div>
        )}

        {crews.length > 0 && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <Users className="h-3.5 w-3.5" /> Your crew
            </div>
            {crews.map((c) => (
              <div key={c.name} className="flex items-start gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.member_names.length > 0 && (
                    <> with {c.member_names.join(', ')}</>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {departHQ && (
          <div className="rounded-md border-2 border-dashed bg-background px-3 py-2.5 text-sm flex items-center gap-2"
               style={{ borderColor: 'var(--orange, #EA580C)' }}>
            <MapPin className="h-4 w-4" style={{ color: 'var(--orange, #EA580C)' }} />
            <span>
              Depart HQ at <span className="font-bold tabular-nums">{departHQ}</span>
            </span>
          </div>
        )}

        {headsUp.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 space-y-1">
            <p className="font-bold uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1">
              <Info className="h-3.5 w-3.5" /> Heads up
            </p>
            {headsUp.slice(0, 6).map((line, i) => (
              <p key={i} className="leading-snug">• {line}</p>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleStartMyDay}
          disabled={starting}
          className="w-full h-14 text-base font-semibold gap-2 mt-2"
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          {starting ? 'Starting…' : 'Start My Day'}
        </Button>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-sm font-semibold leading-tight mt-1 truncate">{value}</p>
    </div>
  );
}
