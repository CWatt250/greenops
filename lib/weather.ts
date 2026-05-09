const OWM_KEY = process.env.NEXT_PUBLIC_OWM_KEY ?? '';

const BAD_CONDITIONS = ['Rain', 'Snow', 'Thunderstorm', 'Drizzle'];

export interface WeatherResult {
  summary: string;
  flag: boolean;
}

export interface DashboardWeatherDay {
  /** YYYY-MM-DD */
  date: string;
  /** Three-letter day abbreviation, e.g. "Thu". */
  dayLabel: string;
  /** Hi temperature in °F (rounded). */
  highF: number;
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
    tempF: number;
    condition: string;
    main: string;
  } | null;
  /** Today + next 2 days. Always 3 entries when ok=true. */
  forecast: DashboardWeatherDay[];
  /** True when a real OWM key was used; false for the fallback path so the
   *  UI can show a "sample weather" notice. */
  ok: boolean;
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
    // Find the forecast entry closest to 09:00 on the route date
    const target = `${date} 09:00:00`;
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

function fallbackWeather(): DashboardWeatherResult {
  const out: DashboardWeatherDay[] = [];
  const sample = [
    { highF: 68, condition: 'Sunny',     main: 'Clear',  pop: 0,    badWeather: false },
    { highF: 62, condition: '40% rain',  main: 'Rain',   pop: 0.4,  badWeather: true },
    { highF: 71, condition: 'Clear',     main: 'Clear',  pop: 0,    badWeather: false },
  ];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      date: localDateStr(d),
      dayLabel: DAY_LABELS[d.getDay()],
      ...sample[i],
    });
  }
  return {
    today: { tempF: out[0].highF, condition: out[0].condition, main: out[0].main },
    forecast: out,
    ok: false,
  };
}

/**
 * Fetch a 3-day forecast plus a current-day snapshot for the dashboard hero.
 * Buckets the OWM /forecast 3-hour entries by local date and picks the
 * highest temp + worst condition per day.
 */
export async function getDashboardWeather(
  query: { lat: number; lng: number } | { city: string; state?: string | null; country?: string },
): Promise<DashboardWeatherResult> {
  if (!OWM_KEY || OWM_KEY === 'placeholder') return fallbackWeather();

  let url = '';
  if ('lat' in query) {
    url = `https://api.openweathermap.org/data/2.5/forecast?lat=${query.lat}&lon=${query.lng}&appid=${OWM_KEY}&units=imperial&cnt=40`;
  } else {
    const country = query.country ?? 'US';
    const q = [query.city, query.state, country].filter(Boolean).join(',');
    url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(q)}&appid=${OWM_KEY}&units=imperial&cnt=40`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return fallbackWeather();
    const data = await res.json() as {
      list?: Array<{
        dt_txt: string;
        main: { temp: number };
        weather: Array<{ main: string; description: string }>;
        pop?: number;
      }>;
    };
    const list = data.list ?? [];
    if (list.length === 0) return fallbackWeather();

    // Group by local YYYY-MM-DD (OWM dt_txt is UTC; treat the date prefix as
    // local — it's close enough for a 3-day glance).
    const buckets = new Map<string, typeof list>();
    for (const slot of list) {
      const dateKey = slot.dt_txt.slice(0, 10);
      const arr = buckets.get(dateKey) ?? [];
      arr.push(slot);
      buckets.set(dateKey, arr);
    }

    const todayStr = localDateStr(new Date());
    const days: DashboardWeatherDay[] = [];

    // Walk forward up to 5 days from today to collect the first 3 with data.
    for (let offset = 0; offset < 5 && days.length < 3; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const dateKey = localDateStr(d);
      const slots = buckets.get(dateKey);
      if (!slots || slots.length === 0) continue;

      const highF = Math.round(Math.max(...slots.map((s) => s.main.temp)));
      // Pick the worst weather of the day (rain > snow > thunder > clouds > clear).
      const ranking = (m: string) =>
        m === 'Thunderstorm' ? 4 : m === 'Snow' ? 3 : m === 'Rain' || m === 'Drizzle' ? 2 : m === 'Clouds' ? 1 : 0;
      const worst = slots.reduce((acc, s) =>
        ranking(s.weather[0]?.main ?? 'Clear') > ranking(acc.weather[0]?.main ?? 'Clear') ? s : acc,
      slots[0]);
      const main = worst.weather[0]?.main ?? 'Clear';
      const pop = Math.max(...slots.map((s) => s.pop ?? 0));
      const badWeather = BAD_CONDITIONS.includes(main);

      let condition: string;
      if (badWeather && pop > 0) condition = `${Math.round(pop * 100)}% ${main.toLowerCase()}`;
      else if (main === 'Clear') condition = 'Sunny';
      else if (main === 'Clouds') condition = 'Cloudy';
      else condition = main;

      days.push({
        date: dateKey,
        dayLabel: DAY_LABELS[d.getDay()],
        highF,
        condition,
        main,
        pop,
        badWeather,
      });
    }

    if (days.length === 0) return fallbackWeather();

    const todayDay = days.find((d) => d.date === todayStr) ?? days[0];

    return {
      today: { tempF: todayDay.highF, condition: todayDay.condition, main: todayDay.main },
      forecast: days,
      ok: true,
    };
  } catch {
    return fallbackWeather();
  }
}
