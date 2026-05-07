const OWM_KEY = process.env.NEXT_PUBLIC_OWM_KEY ?? '';

const BAD_CONDITIONS = ['Rain', 'Snow', 'Thunderstorm', 'Drizzle'];

export interface WeatherResult {
  summary: string;
  flag: boolean;
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
