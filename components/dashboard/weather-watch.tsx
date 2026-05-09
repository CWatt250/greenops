import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Droplets,
} from 'lucide-react';
import type { DashboardWeatherDay } from '@/lib/weather';

interface Props {
  forecast: DashboardWeatherDay[];
  /** Number of jobs scheduled on rainy/snowy days — fuels the alert bar. */
  affectedJobsByDate: Record<string, number>;
  /** True when real OWM data was used; false for the fallback sample. */
  ok: boolean;
  /** Subtitle location, e.g. "Kennewick, WA". */
  locationLabel: string;
}

function iconForMain(main: string) {
  switch (main) {
    case 'Clear':        return Sun;
    case 'Clouds':       return Cloud;
    case 'Rain':         return CloudRain;
    case 'Drizzle':      return CloudDrizzle;
    case 'Snow':         return CloudSnow;
    case 'Thunderstorm': return CloudLightning;
    default:             return Sun;
  }
}

export function WeatherWatch({ forecast, affectedJobsByDate, ok, locationLabel }: Props) {
  const badDays = forecast.filter((d) => d.badWeather);
  const totalAffected = badDays.reduce(
    (sum, d) => sum + (affectedJobsByDate[d.date] ?? 0),
    0,
  );
  const firstBad = badDays[0];
  const dayCount = forecast.length;

  // 3 days: regular grid. 5/7 days: horizontal scroll on mobile, fit on
  // desktop. Each card has a min-width so they stay readable when scrolling.
  const useScrollLayout = dayCount >= 5;

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2
        className="text-base uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
      >
        Weather watch
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Next {dayCount} day{dayCount === 1 ? '' : 's'} · {ok ? locationLabel : `${locationLabel} (sample)`}
      </p>

      {useScrollLayout ? (
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex gap-2 px-1 min-w-max">
            {forecast.map((d) => (
              <DayCard key={d.date} day={d} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {forecast.map((d) => (
            <DayCard key={d.date} day={d} />
          ))}
        </div>
      )}

      {firstBad && (
        <div
          className="mt-3 rounded-md border px-3 py-2 text-xs flex items-start gap-2"
          style={{
            backgroundColor: 'var(--orange-soft)',
            borderColor: 'var(--orange)',
            color: 'var(--orange-deep)',
          }}
        >
          <Droplets className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>{firstBad.dayLabel} {firstBad.main.toLowerCase()} risk</strong>
            {totalAffected > 0
              ? ` — ${totalAffected} job${totalAffected === 1 ? '' : 's'} may need to push.`
              : ' — keep an eye on the forecast.'}
          </span>
        </div>
      )}
    </div>
  );
}

function DayCard({ day }: { day: DashboardWeatherDay }) {
  const Icon = iconForMain(day.main);
  return (
    <div
      className="rounded-lg border p-2.5 text-center min-w-[80px] flex-shrink-0"
      style={{
        backgroundColor: day.badWeather ? 'var(--orange-soft)' : 'var(--muted, #F5F5F0)',
        borderColor: day.badWeather ? 'var(--orange)' : 'var(--border, #E0DCCD)',
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {day.dayLabel}
      </p>
      <Icon
        className="h-5 w-5 mx-auto my-1"
        style={{ color: day.badWeather ? 'var(--orange-deep)' : 'var(--orange)' }}
      />
      <p
        className="text-lg leading-none tabular-nums"
        style={{ fontFamily: 'var(--font-display), Impact, sans-serif' }}
      >
        {day.high}{day.unitSymbol.replace('°', '°')}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 truncate">{day.condition}</p>
    </div>
  );
}
