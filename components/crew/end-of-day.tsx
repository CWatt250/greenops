'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { openDirections } from '@/lib/native-maps';
import {
  CheckCircle2, Clock, Truck, Camera, PenLine, Ruler, Navigation,
  LogOut, Loader2, Smile, Meh, Frown,
} from 'lucide-react';

interface Props {
  profileId: string;
  companyId: string;
  workerName: string;
  todayDate: string;
  /** Pre-computed stats from /today server component. */
  stats: {
    jobs_completed: number;
    jobs_total: number;
    worked_minutes: number;
    drive_minutes: number;
    drive_miles: number;
    photos_count: number;
    signatures_count: number;
    measurements_count: number;
  };
  /** Shift bookends from clock_events (UTC ISO strings). */
  shiftStartAt: string | null;
  /** Company depot for the "Drive back to HQ" deep link. */
  depot: { lat: number | null; lng: number | null; address: string | null };
}

type Mood = 'great' | 'fine' | 'rough';

function formatDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

export function EndOfDay({
  profileId,
  companyId,
  workerName,
  todayDate,
  stats,
  shiftStartAt,
  depot,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [mood, setMood] = useState<Mood | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = workerName.split(' ')[0] || 'crew';

  async function handleClockOut() {
    setSubmitting(true);
    setError(null);

    const pos = await getPosition();
    const nowIso = new Date().toISOString();

    // 1. Insert shift_end clock event.
    const { error: clockErr } = await supabase.from('clock_events').insert({
      company_id: companyId,
      profile_id: profileId,
      event_type: 'shift_end',
      latitude: pos?.coords.latitude ?? null,
      longitude: pos?.coords.longitude ?? null,
      job_id: null,
    });
    if (clockErr) {
      setError(clockErr.message);
      setSubmitting(false);
      return;
    }

    // 2. Upsert daily_summaries — one row per (profile, date).
    const { error: summaryErr } = await supabase
      .from('daily_summaries')
      .upsert({
        company_id: companyId,
        profile_id: profileId,
        date: todayDate,
        shift_start_at: shiftStartAt,
        shift_end_at: nowIso,
        jobs_completed: stats.jobs_completed,
        worked_minutes: stats.worked_minutes,
        drive_minutes: stats.drive_minutes,
        drive_miles: stats.drive_miles,
        photos_count: stats.photos_count,
        signatures_count: stats.signatures_count,
        measurements_count: stats.measurements_count,
        equipment_notes: equipmentNotes.trim() || null,
        day_mood: mood,
      }, { onConflict: 'profile_id,date' });

    if (summaryErr) {
      setError(summaryErr.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  function handleDriveHome() {
    openDirections({
      lat: depot.lat,
      lng: depot.lng,
      address: depot.address,
    });
  }

  return (
    <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div
        className="px-5 py-5 text-center text-white"
        style={{ backgroundImage: 'linear-gradient(160deg, var(--color-brand-dark-raw, #1C2B1A) 0%, var(--color-brand-green-raw, #3D6B2C) 100%)' }}
      >
        <p className="text-3xl">🎉</p>
        <h2 className="text-xl font-bold mt-1">Day Complete</h2>
        <p className="text-xs opacity-80 mt-1">Great work, {firstName}!</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Summary stats */}
        <ul className="space-y-1.5 text-sm">
          <StatLine
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
            label={`${stats.jobs_completed} of ${stats.jobs_total} jobs done`}
          />
          <StatLine
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label={`Worked: ${formatDuration(stats.worked_minutes)}`}
          />
          <StatLine
            icon={<Truck className="h-4 w-4 text-muted-foreground" />}
            label={`Drove: ${formatDuration(stats.drive_minutes)} · ${stats.drive_miles.toFixed(1)} mi`}
          />
          {stats.photos_count > 0 && (
            <StatLine
              icon={<Camera className="h-4 w-4 text-muted-foreground" />}
              label={`${stats.photos_count} photos captured`}
            />
          )}
          {stats.signatures_count > 0 && (
            <StatLine
              icon={<PenLine className="h-4 w-4 text-muted-foreground" />}
              label={`${stats.signatures_count} signatures collected`}
            />
          )}
          {stats.measurements_count > 0 && (
            <StatLine
              icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
              label={`${stats.measurements_count} field measurement${stats.measurements_count === 1 ? '' : 's'}`}
            />
          )}
        </ul>

        {/* Drive home */}
        {(depot.lat !== null || depot.address) && (
          <Button
            type="button"
            onClick={handleDriveHome}
            className="w-full h-11 gap-2"
            style={{ backgroundColor: 'var(--orange, #EA580C)', color: '#fff' }}
          >
            <Navigation className="h-4 w-4" />
            Get Directions to HQ
          </Button>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="equipment-notes">
            Anything to report?
          </label>
          <textarea
            id="equipment-notes"
            value={equipmentNotes}
            onChange={(e) => setEquipmentNotes(e.target.value)}
            rows={3}
            placeholder="Equipment issues, supply needs, customer feedback…"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
        </div>

        {/* Mood */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">How was your day?</p>
          <div className="grid grid-cols-3 gap-2">
            <MoodOption icon={<Smile className="h-5 w-5" />} label="Great" value="great" current={mood} onPick={setMood} color="#16a34a" />
            <MoodOption icon={<Meh className="h-5 w-5" />}   label="Fine"  value="fine"  current={mood} onPick={setMood} color="#0891b2" />
            <MoodOption icon={<Frown className="h-5 w-5" />} label="Rough" value="rough" current={mood} onPick={setMood} color="#dc2626" />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleClockOut}
          disabled={submitting}
          className="w-full h-12 text-base font-semibold gap-2"
          style={{ backgroundColor: 'var(--color-brand-green-raw)', color: '#fff' }}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
          {submitting ? 'Clocking out…' : 'Clock Out For Day'}
        </Button>
      </div>
    </section>
  );
}

function StatLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </li>
  );
}

function MoodOption({
  icon, label, value, current, onPick, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: Mood;
  current: Mood | null;
  onPick: (m: Mood) => void;
  color: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className="flex flex-col items-center justify-center rounded-lg border bg-background py-2.5 text-xs font-medium transition-all"
      style={active ? { borderColor: color, color, backgroundColor: `${color}11`, borderWidth: 2 } : undefined}
    >
      <span style={active ? { color } : undefined}>{icon}</span>
      <span className="mt-0.5">{label}</span>
    </button>
  );
}
