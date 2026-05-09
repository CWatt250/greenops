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

export function WeatherWatch({ forecast, affectedJobsByDate, ok }: Props) {
  const badDays = forecast.filter((d) => d.badWeather);
  const totalAffected = badDays.reduce(
    (sum, d) => sum + (affectedJobsByDate[d.date] ?? 0),
    0,
  );
  const firstBad = badDays[0];

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2
        className="text-base uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
      >
        Weather watch
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Next 3 days · {ok ? 'OpenWeatherMap' : 'sample data — set NEXT_PUBLIC_OWM_KEY'}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {forecast.map((d) => {
          const Icon = iconForMain(d.main);
          return (
            <div
              key={d.date}
              className="rounded-lg border p-2.5 text-center"
              style={{
                backgroundColor: d.badWeather ? 'var(--orange-soft)' : 'var(--muted, #F5F5F0)',
                borderColor: d.badWeather ? 'var(--orange)' : 'var(--border, #E0DCCD)',
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {d.dayLabel}
              </p>
              <Icon
                className="h-5 w-5 mx-auto my-1"
                style={{ color: d.badWeather ? 'var(--orange-deep)' : 'var(--orange)' }}
              />
              <p
                className="text-lg leading-none tabular-nums"
                style={{ fontFamily: 'var(--font-display), Impact, sans-serif' }}
              >
                {d.highF}°
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{d.condition}</p>
            </div>
          );
        })}
      </div>

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
