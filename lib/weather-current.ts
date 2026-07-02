// Point-in-time conditions for the chemical application log (WSDA records
// require temp/wind/conditions at time of application). Kept separate from
// lib/weather.ts, which is forecast-oriented.

const OWM_KEY = process.env.NEXT_PUBLIC_OWM_KEY ?? '';

export interface CurrentConditions {
  tempF: number;
  windMph: number;
  conditions: string;
}

export async function getCurrentConditions(
  lat: number,
  lng: number,
): Promise<CurrentConditions | null> {
  if (!OWM_KEY || OWM_KEY === 'placeholder') return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=imperial&appid=${OWM_KEY}`,
    );
    if (!res.ok) return null;
    const d = await res.json() as {
      main?: { temp?: number };
      wind?: { speed?: number };
      weather?: Array<{ description?: string }>;
    };
    if (typeof d.main?.temp !== 'number') return null;
    return {
      tempF: Math.round(d.main.temp),
      windMph: Math.round(d.wind?.speed ?? 0),
      conditions: d.weather?.[0]?.description ?? '',
    };
  } catch {
    return null;
  }
}
