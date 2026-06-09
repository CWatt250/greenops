import type { WeatherAlert, WeatherSuggestionInput } from './weather-suggestion';

const OWM_KEY = process.env.NEXT_PUBLIC_OWM_KEY ?? '';

const BAD_CONDITIONS = ['Rain', 'Snow', 'Thunderstorm', 'Drizzle'];

export type WeatherUnits = 'imperial' | 'metric';

export interface WeatherResult {
  summary: string;
  flag: boolean;
}

export interface DashboardWeatherDay {
  /** YYYY-MM-DD */
  date: string;
  /** Three-letter day abbreviation, e.g. "Thu". */
  dayLabel: string;
  /** Hi temperature, rounded, in whichever unit was requested. */
  high: number;
  /** "°F" or "°C" — convenience for the UI so it doesn't need to know units. */
  unitSymbol: '°F' | '°C';
  /** Short condition label, e.g. "Sunny", "40% rain", "Cloudy". */
  condition: string;
  /** OWM weather "main" value: Clear, Clouds, Rain, Snow, Thunderstorm, ... */
  main: string;
  /** Probability of precipitation (0–1) for the daytime hours. */
  pop: number;
  /** True when the day has rain/snow/thunder forecast. */
  badWeather: boolean;
}

export interface DashboardWeatherResult {
  /** Today's snapshot used for the hero greeting. Falls back to the first
   *  forecast slot when "today" isn't in the response window. */
  today: {
    temp: number;
    unitSymbol: '°F' | '°C';
    condition: string;
    main: string;
  } | null;
  /** Variable length depending on the company's weather_forecast_days
   *  preference (3, 5, or 7 entries). */
  forecast: DashboardWeatherDay[];
  /** True when a real OWM key was used; false for the fallback path so the
   *  UI can show a "sample weather" notice. */
  ok: boolean;
  /** Human-readable label for the location: company.weather_location_label,
   *  city, or "OpenWeatherMap" as a generic fallback. */
  locationLabel: string;
}

export async function getWeatherForRoute(
  lat: number,
  lng: number,
  date: string // YYYY-MM-DD
): Promise<WeatherResult> {
  if (!OWM_KEY) return { summary: 'Weather key not configured', flag: false };

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=imperial&cnt=40`
    );
    if (!res.ok) return { summary: 'Weather unavailable', flag: false };

    const data = await res.json();
    void date; // reserved — we currently pick the first slot regardless
    const forecast = (data.list ?? []).find(
      (f: { dt_txt: string }) =>
        f.dt_txt.startsWith(date)
    ) ?? (data.list ?? [])[0];

    if (!forecast) return { summary: 'No forecast data', flag: false };

    const main: string = forecast.weather?.[0]?.main ?? 'Clear';
    const desc: string = forecast.weather?.[0]?.description ?? 'clear sky';
    const flag = BAD_CONDITIONS.includes(main);

    return { summary: desc, flag };
  } catch {
    return { summary: 'Weather check failed', flag: false };
  }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateStr(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function unitSymbolFor(units: WeatherUnits): '°F' | '°C' {
  return units === 'metric' ? '°C' : '°F';
}

function describeCondition(main: string, pop: number, badWeather: boolean): string {
  if (badWeather && pop > 0) return `${Math.round(pop * 100)}% ${main.toLowerCase()}`;
  if (main === 'Clear') return 'Sunny';
  if (main === 'Clouds') return 'Cloudy';
  return main;
}

function fallbackWeather(
  days: number,
  units: WeatherUnits,
  locationLabel: string,
): DashboardWeatherResult {
  const sample = [
    { high: 68, condition: 'Sunny',     main: 'Clear',  pop: 0,    badWeather: false },
    { high: 62, condition: '40% rain',  main: 'Rain',   pop: 0.4,  badWeather: true },
    { high: 71, condition: 'Clear',     main: 'Clear',  pop: 0,    badWeather: false },
    { high: 74, condition: 'Sunny',     main: 'Clear',  pop: 0,    badWeather: false },
    { high: 65, condition: 'Cloudy',    main: 'Clouds', pop: 0.1,  badWeather: false },
    { high: 60, condition: '20% rain',  main: 'Rain',   pop: 0.2,  badWeather: true },
    { high: 70, condition: 'Sunny',     main: 'Clear',  pop: 0,    badWeather: false },
  ];
  const symbol = unitSymbolFor(units);
  // Convert sample °F to °C when metric requested.
  const adjust = (f: number) => units === 'metric' ? Math.round((f - 32) * 5 / 9) : f;
  const out: DashboardWeatherDay[] = [];
  for (let i = 0; i < days && i < sample.length; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const s = sample[i];
    out.push({
      date: localDateStr(d),
      dayLabel: DAY_LABELS[d.getDay()],
      high: adjust(s.high),
      unitSymbol: symbol,
      condition: s.condition,
      main: s.main,
      pop: s.pop,
      badWeather: s.badWeather,
    });
  }
  return {
    today: out[0]
      ? { temp: out[0].high, unitSymbol: symbol, condition: out[0].condition, main: out[0].main }
      : null,
    forecast: out,
    ok: false,
    locationLabel,
  };
}

interface ForecastQueryByCoords { lat: number; lng: number }
interface ForecastQueryByCity { city: string; state?: string | null; country?: string }
export type ForecastQuery = ForecastQueryByCoords | ForecastQueryByCity;

interface DashboardWeatherOptions {
  /** 3, 5, or 7. Defaults to 3. 7 requires a OneCall-enabled key; we
   *  gracefully fall back to 5 days from /forecast otherwise. */
  days?: number;
  /** 'imperial' (°F + mph) or 'metric' (°C + m/s). Defaults to 'imperial'. */
  units?: WeatherUnits;
  /** Human label shown in the widget subtitle. Falls back sensibly. */
  locationLabel?: string;
}

function clampDays(n: number | undefined): 3 | 5 | 7 {
  if (n === 5) return 5;
  if (n === 7) return 7;
  return 3;
}

/**
 * Fetch a multi-day forecast plus today's snapshot for the dashboard.
 *
 * Strategy:
 *  - 3 or 5 days → use the free 5-day /forecast endpoint, bucket by date.
 *  - 7 days → try OneCall 3.0 first (requires a OneCall-enabled key);
 *    on 401/404 fall back to /forecast capped at 5.
 *  - Any error → sample data with the requested length so the UI still
 *    renders something coherent.
 */
export async function getDashboardWeather(
  query: ForecastQuery,
  options: DashboardWeatherOptions = {},
): Promise<DashboardWeatherResult> {
  const days = clampDays(options.days);
  const units: WeatherUnits = options.units ?? 'imperial';
  const symbol = unitSymbolFor(units);
  const locationLabel = options.locationLabel
    ?? ('city' in query ? [query.city, query.state].filter(Boolean).join(', ') : 'OpenWeatherMap');

  if (!OWM_KEY || OWM_KEY === 'placeholder') {
    return fallbackWeather(days, units, locationLabel);
  }

  // ── 7-day path: try OneCall, fall back to /forecast for shortfall. ─────
  if (days === 7 && 'lat' in query) {
    const oc = await tryOneCall(query, units, locationLabel);
    if (oc) return oc;
  }
  if (days === 7 && 'city' in query) {
    // OneCall requires lat/lng — geocode via OWM's /weather endpoint to
    // resolve the city to coords, then retry.
    const coords = await geocodeViaOwm(query);
    if (coords) {
      const oc = await tryOneCall(coords, units, locationLabel);
      if (oc) return oc;
    }
  }

  // ── 3 / 5 day path (or 7-day fallback) via free /forecast endpoint. ─────
  const url = forecastUrl(query, units);

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return fallbackWeather(days, units, locationLabel);
    const data = await res.json() as {
      list?: Array<{
        dt_txt: string;
        main: { temp: number };
        weather: Array<{ main: string; description: string }>;
        pop?: number;
      }>;
    };
    const list = data.list ?? [];
    if (list.length === 0) return fallbackWeather(days, units, locationLabel);

    // Group by local YYYY-MM-DD (OWM dt_txt is UTC; treat the date prefix as
    // local — close enough for a 3–7 day glance).
    const buckets = new Map<string, typeof list>();
    for (const slot of list) {
      const dateKey = slot.dt_txt.slice(0, 10);
      const arr = buckets.get(dateKey) ?? [];
      arr.push(slot);
      buckets.set(dateKey, arr);
    }

    const todayStr = localDateStr(new Date());
    const out: DashboardWeatherDay[] = [];

    // /forecast caps at 5 days; if the user wanted 7 we just return what we have.
    const lookAhead = Math.max(days, 5);
    for (let offset = 0; offset < lookAhead && out.length < days; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const dateKey = localDateStr(d);
      const slots = buckets.get(dateKey);
      if (!slots || slots.length === 0) continue;

      const high = Math.round(Math.max(...slots.map((s) => s.main.temp)));
      const ranking = (m: string) =>
        m === 'Thunderstorm' ? 4 : m === 'Snow' ? 3 : m === 'Rain' || m === 'Drizzle' ? 2 : m === 'Clouds' ? 1 : 0;
      const worst = slots.reduce((acc, s) =>
        ranking(s.weather[0]?.main ?? 'Clear') > ranking(acc.weather[0]?.main ?? 'Clear') ? s : acc,
      slots[0]);
      const main = worst.weather[0]?.main ?? 'Clear';
      const pop = Math.max(...slots.map((s) => s.pop ?? 0));
      const badWeather = BAD_CONDITIONS.includes(main);

      out.push({
        date: dateKey,
        dayLabel: DAY_LABELS[d.getDay()],
        high,
        unitSymbol: symbol,
        condition: describeCondition(main, pop, badWeather),
        main,
        pop,
        badWeather,
      });
    }

    if (out.length === 0) return fallbackWeather(days, units, locationLabel);

    const todayDay = out.find((d) => d.date === todayStr) ?? out[0];

    return {
      today: { temp: todayDay.high, unitSymbol: symbol, condition: todayDay.condition, main: todayDay.main },
      forecast: out,
      ok: true,
      locationLabel,
    };
  } catch {
    return fallbackWeather(days, units, locationLabel);
  }
}

// ── Announcement weather ──────────────────────────────────────────────────
//
// Builds the normalized input for `suggestAnnouncement` (lib/weather-suggestion)
// from the OpenWeatherMap endpoints already in use by this app — current
// conditions from the FREE /data/2.5/weather, morning timing from the FREE
// /data/2.5/forecast 3-hour forecast, plus active official alerts from the SAME
// One Call 3.0 fetch the dashboard's 7-day forecast already makes (shared via a
// short TTL cache, so it adds no meaningful API usage). This is the only weather
// path that needs feels-like / wind / gust, which the dashboard's daily forecast
// (getDashboardWeather) doesn't carry, so it makes its own current/forecast
// calls rather than reusing that aggregated shape.

/** Working-day window (local hours) used to scope morning rain + dry-hour search. */
const MORNING_START_HOUR = 6;
const MORNING_END_HOUR = 11; // inclusive — last "morning" forecast hour considered
const WORK_END_HOUR = 17;
/** A forecast slot counts as "dry" below this precip probability and clear of rain/snow. */
const DRY_POP_THRESHOLD = 0.3;

function hourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

interface OwmCurrent {
  main?: { temp?: number; feels_like?: number };
  wind?: { speed?: number; gust?: number };
  weather?: Array<{ main?: string }>;
  rain?: Record<string, number>;
  snow?: Record<string, number>;
}

interface OwmForecastSlot {
  dt: number;
  main?: { temp?: number };
  weather?: Array<{ main?: string }>;
  pop?: number;
}

/**
 * Fetch + normalize the weather inputs the announcement suggester needs.
 *
 * Returns null only when no API key is configured or current conditions can't
 * be fetched; a missing forecast just zeroes out the morning-timing fields so
 * the heat/wind/frost/rain-now rules still work.
 */
export async function getAnnouncementWeather(
  query: ForecastQuery,
): Promise<WeatherSuggestionInput | null> {
  if (!OWM_KEY || OWM_KEY === 'placeholder') return null;

  // ── Current conditions (free /weather endpoint). ─────────────────────────
  let current: OwmCurrent;
  try {
    const url = 'lat' in query
      ? `https://api.openweathermap.org/data/2.5/weather?lat=${query.lat}&lon=${query.lng}&units=imperial&appid=${OWM_KEY}`
      : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
          [query.city, query.state, query.country ?? 'US'].filter(Boolean).join(','),
        )}&units=imperial&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    current = (await res.json()) as OwmCurrent;
  } catch {
    return null;
  }

  const conditionMain = current.weather?.[0]?.main ?? 'Clear';
  const rainNow = Object.values(current.rain ?? {}).some((v) => v > 0)
    || Object.values(current.snow ?? {}).some((v) => v > 0);
  const isRainingNow = rainNow || BAD_CONDITIONS.includes(conditionMain);

  // ── Morning timing (free 3-hour /forecast endpoint). Best-effort. ────────
  let morningPrecipProb = 0;
  let firstDryHourLabel: string | null = null;
  try {
    const url = 'lat' in query
      ? `https://api.openweathermap.org/data/2.5/forecast?lat=${query.lat}&lon=${query.lng}&units=imperial&cnt=12&appid=${OWM_KEY}`
      : `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
          [query.city, query.state, query.country ?? 'US'].filter(Boolean).join(','),
        )}&units=imperial&cnt=12&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { list?: OwmForecastSlot[] };
      const todayStr = localDateStr(new Date());
      const slots = (data.list ?? []).map((s) => {
        const when = new Date(s.dt * 1000);
        return {
          date: localDateStr(when),
          hour: when.getHours(),
          pop: s.pop ?? 0,
          main: s.weather?.[0]?.main ?? 'Clear',
        };
      });

      // Max precip probability across today's morning hours.
      const morning = slots.filter(
        (s) => s.date === todayStr && s.hour >= MORNING_START_HOUR && s.hour <= MORNING_END_HOUR,
      );
      morningPrecipProb = morning.reduce((max, s) => Math.max(max, s.pop), 0);

      // First dry working hour still ahead of us today.
      const nowHour = new Date().getHours();
      const dry = slots.find(
        (s) =>
          s.date === todayStr &&
          s.hour >= Math.max(MORNING_START_HOUR, nowHour) &&
          s.hour <= WORK_END_HOUR &&
          s.pop < DRY_POP_THRESHOLD &&
          !BAD_CONDITIONS.includes(s.main),
      );
      firstDryHourLabel = dry ? hourLabel(dry.hour) : null;
    }
  } catch {
    // Leave morning fields at their dry defaults.
  }

  // ── Official alerts (One Call 3.0 `alerts[]`, shared/cached). Best-effort. ─
  // An active, crew-relevant alert outranks the raw thresholds in the suggester.
  // Any failure here leaves `alerts` undefined, so the suggestion silently falls
  // back to v1 — "Suggest from weather" must never break on the alerts path.
  let alerts: WeatherAlert[] | undefined;
  try {
    const coords = 'lat' in query
      ? { lat: query.lat, lng: query.lng }
      : await geocodeViaOwm(query);
    if (coords) {
      const active = await fetchActiveAlerts(coords, 'imperial');
      if (active.length > 0) alerts = active;
    }
  } catch {
    // Ignore — fall back to threshold-only suggestion.
  }

  return {
    tempF: Math.round(current.main?.temp ?? 0),
    feelsLikeF: Math.round(current.main?.feels_like ?? current.main?.temp ?? 0),
    windMph: Math.round(current.wind?.speed ?? 0),
    gustMph: typeof current.wind?.gust === 'number' ? Math.round(current.wind.gust) : null,
    conditionMain,
    isRainingNow,
    morningPrecipProb,
    firstDryHourLabel,
    alerts,
  };
}

function forecastUrl(query: ForecastQuery, units: WeatherUnits): string {
  const base = 'https://api.openweathermap.org/data/2.5/forecast';
  if ('lat' in query) {
    return `${base}?lat=${query.lat}&lon=${query.lng}&appid=${OWM_KEY}&units=${units}&cnt=40`;
  }
  const country = query.country ?? 'US';
  const q = [query.city, query.state, country].filter(Boolean).join(',');
  return `${base}?q=${encodeURIComponent(q)}&appid=${OWM_KEY}&units=${units}&cnt=40`;
}

async function geocodeViaOwm(
  query: ForecastQueryByCity,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const country = query.country ?? 'US';
    const q = [query.city, query.state, country].filter(Boolean).join(',');
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&appid=${OWM_KEY}`,
      { next: { revalidate: 86_400 } },
    );
    if (!res.ok) return null;
    const data = await res.json() as { coord?: { lat: number; lon: number } };
    if (!data.coord) return null;
    return { lat: data.coord.lat, lng: data.coord.lon };
  } catch {
    return null;
  }
}

interface OneCallAlert {
  sender_name?: string;
  event?: string;
  /** Unix seconds. */
  start?: number;
  /** Unix seconds. */
  end?: number;
  description?: string;
  tags?: string[];
}

interface OneCallResponse {
  daily?: Array<{
    dt: number;
    temp: { max: number };
    weather: Array<{ main: string; description: string }>;
    pop?: number;
  }>;
  alerts?: OneCallAlert[];
}

/**
 * Shared in-memory TTL cache for One Call 3.0 responses, keyed by location +
 * units. Both the dashboard's 7-day forecast and the announcement suggester read
 * the same window, so a single fetch every ~12 minutes covers both — no
 * meaningful extra API usage on top of what the dashboard already spends. (We
 * also pass `next.revalidate` so the server render path dedupes too; this memo
 * is what dedupes when the call runs client-side, where `next` is ignored.)
 */
const ONECALL_TTL_MS = 12 * 60 * 1000;
const oneCallCache = new Map<string, { at: number; data: OneCallResponse }>();

/**
 * Fetch + cache One Call 3.0. Includes `alerts[]` (only current/minutely/hourly
 * are excluded), so callers get both the daily forecast and active alerts from a
 * single request. Returns null on any error so callers degrade gracefully.
 */
async function fetchOneCall(
  query: ForecastQueryByCoords,
  units: WeatherUnits,
): Promise<OneCallResponse | null> {
  const key = `${query.lat.toFixed(3)},${query.lng.toFixed(3)},${units}`;
  const cached = oneCallCache.get(key);
  const nowMs = Date.now();
  if (cached && nowMs - cached.at < ONECALL_TTL_MS) return cached.data;

  try {
    const url =
      `https://api.openweathermap.org/data/3.0/onecall?lat=${query.lat}&lon=${query.lng}` +
      `&exclude=current,minutely,hourly&units=${units}&appid=${OWM_KEY}`;
    const res = await fetch(url, { next: { revalidate: 720 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OneCallResponse;
    oneCallCache.set(key, { at: nowMs, data });
    return data;
  } catch {
    return null;
  }
}

/**
 * Format a One Call alert end time (unix seconds) into a short local label, e.g.
 * "11 PM", "11:30 PM", or "Tue 6 AM" when it spills into another day. Lives here
 * (not in the pure suggester) so the timezone math stays in the I/O layer.
 */
function alertEndLabel(endUnix: number): string {
  const d = new Date(endUnix * 1000);
  const now = new Date();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const time = minute === 0 ? `${h12} ${period}` : `${h12}:${String(minute).padStart(2, '0')} ${period}`;
  return localDateStr(d) !== localDateStr(now) ? `${DAY_LABELS[d.getDay()]} ${time}` : time;
}

/**
 * Pull the active, normalized alerts for a coordinate from One Call. "Active" =
 * the current moment sits within [start, end]. Returns [] when none are active;
 * never throws (One Call errors surface as an empty list upstream).
 */
async function fetchActiveAlerts(
  query: ForecastQueryByCoords,
  units: WeatherUnits,
): Promise<WeatherAlert[]> {
  const data = await fetchOneCall(query, units);
  if (!data?.alerts?.length) return [];
  const nowSec = Math.floor(Date.now() / 1000);
  return data.alerts
    .filter(
      (a) =>
        (a.start == null || a.start <= nowSec) && (a.end == null || a.end >= nowSec),
    )
    .map((a) => ({
      event: a.event ?? 'Weather alert',
      endLabel: typeof a.end === 'number' ? alertEndLabel(a.end) : null,
      tags: a.tags ?? [],
    }));
}

async function tryOneCall(
  query: ForecastQueryByCoords,
  units: WeatherUnits,
  locationLabel: string,
): Promise<DashboardWeatherResult | null> {
  const symbol = unitSymbolFor(units);
  try {
    const data = await fetchOneCall(query, units);
    if (!data) return null;
    const daily = (data.daily ?? []).slice(0, 7);
    if (daily.length === 0) return null;

    const out: DashboardWeatherDay[] = daily.map((d) => {
      const date = new Date(d.dt * 1000);
      const dateKey = localDateStr(date);
      const main = d.weather[0]?.main ?? 'Clear';
      const pop = d.pop ?? 0;
      const badWeather = BAD_CONDITIONS.includes(main);
      return {
        date: dateKey,
        dayLabel: DAY_LABELS[date.getDay()],
        high: Math.round(d.temp.max),
        unitSymbol: symbol,
        condition: describeCondition(main, pop, badWeather),
        main,
        pop,
        badWeather,
      };
    });

    const today = out[0];
    return {
      today: today
        ? { temp: today.high, unitSymbol: symbol, condition: today.condition, main: today.main }
        : null,
      forecast: out,
      ok: true,
      locationLabel,
    };
  } catch {
    return null;
  }
}
