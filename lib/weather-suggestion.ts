/**
 * Weather → suggested announcement.
 *
 * Pure rule logic, extracted the same way the measure tool's math lives in
 * `lib/measurement.ts`: it takes already-normalized weather numbers and returns
 * a `{ title, body, audience }` suggestion (or `null` when conditions are
 * unremarkable). All I/O — the OpenWeatherMap fetch, unit handling, and the
 * timezone math that produces the morning window — lives in `lib/weather.ts`
 * (`getAnnouncementWeather`). Keeping this file side-effect-free makes the
 * decision table trivially unit-testable with mock inputs.
 *
 * The suggestion is a *starting point*. The owner can freely edit the title and
 * body before sending, so the copy is deliberately concise and operational.
 */

/** Audience all weather-ops suggestions default to. */
export type SuggestionAudience = 'all_crew';

export interface WeatherSuggestionInput {
  /** Current air temperature, °F. */
  tempF: number;
  /** Current feels-like temperature, °F (heat index / wind chill). */
  feelsLikeF: number;
  /** Current sustained wind speed, mph. */
  windMph: number;
  /** Current wind gust, mph, or null when not reported. */
  gustMph: number | null;
  /** OpenWeatherMap "main" for current conditions: Clear/Clouds/Rain/Snow/… */
  conditionMain: string;
  /** True when precipitation is falling right now. */
  isRainingNow: boolean;
  /**
   * Highest precipitation probability (0–1) across today's morning hours,
   * taken from the free 3-hour forecast. 0 when the morning has passed or no
   * forecast was available.
   */
  morningPrecipProb: number;
  /**
   * Label of the first dry working hour today (e.g. "10 AM"), or null when the
   * forecast shows no dry window or none could be resolved. Drives the rain
   * delay title's "start at …" copy.
   */
  firstDryHourLabel: string | null;
}

export interface WeatherSuggestionThresholds {
  /** Feels-like at/above this (°F) → heat advisory. */
  heatFeelsLikeF: number;
  /** Sustained wind at/above this (mph) → high-wind hold. */
  windSustainedMph: number;
  /** Gust at/above this (mph) → high-wind hold. */
  windGustMph: number;
  /** Temp or wind chill at/below this (°F) → frost. */
  frostTempF: number;
  /** Morning precip probability at/above this (0–1) → rain delay. */
  morningPrecipProb: number;
}

/**
 * Tune-able cutoffs with Tri-Cities, WA defaults. Pass an override object to
 * `suggestAnnouncement` to retune for a different climate without touching the
 * rules.
 */
export const WEATHER_SUGGESTION_THRESHOLDS: WeatherSuggestionThresholds = {
  heatFeelsLikeF: 95,
  windSustainedMph: 25,
  windGustMph: 30,
  frostTempF: 32,
  morningPrecipProb: 0.5,
};

export interface WeatherSuggestion {
  title: string;
  body: string;
  /** Weather-ops messages default to the crew audience; the owner can change it. */
  audience: SuggestionAudience;
}

function rainBody(input: WeatherSuggestionInput): string {
  const pct = Math.round(input.morningPrecipProb * 100);
  const lead = input.isRainingNow
    ? "Rain is coming down now, so turf and hardscape will be wet and slick."
    : `${pct}% chance of rain through the morning — expect wet, slick conditions.`;
  const tail = input.firstDryHourLabel
    ? ` Looks like it should dry out around ${input.firstDryHourLabel} — plan to start then.`
    : ' Hold the start until things dry out.';
  return `${lead}${tail}`;
}

/**
 * Map normalized weather to a suggested announcement, or null when nothing
 * stands out.
 *
 * Rules are evaluated in priority order — the most schedule-disruptive
 * condition wins when several apply at once:
 *   1. Rain (now, or a high morning precip chance)
 *   2. Heat (feels-like)
 *   3. High wind (sustained or gusting)
 *   4. Frost / cold (temp or wind chill at/below freezing)
 *   5. otherwise → null (clear / normal day, no suggestion)
 */
export function suggestAnnouncement(
  input: WeatherSuggestionInput,
  thresholds: WeatherSuggestionThresholds = WEATHER_SUGGESTION_THRESHOLDS,
): WeatherSuggestion | null {
  const t = thresholds;

  // 1. Rain — now, or a high chance through the morning. Most disruptive.
  if (input.isRainingNow || input.morningPrecipProb >= t.morningPrecipProb) {
    const when = input.firstDryHourLabel
      ? `start at ${input.firstDryHourLabel} today`
      : 'delayed start today';
    return {
      title: `Rain delay — ${when}`,
      body: rainBody(input),
      audience: 'all_crew',
    };
  }

  // 2. Heat — feels-like is the operative number for crew safety.
  if (input.feelsLikeF >= t.heatFeelsLikeF) {
    return {
      title: 'Heat advisory — hydrate, shade breaks, start early',
      body:
        `Feels like ${Math.round(input.feelsLikeF)}°F today. Keep water close, ` +
        'take shade breaks, and front-load the heavy work before the afternoon peak.',
      audience: 'all_crew',
    };
  }

  // 3. Wind — sustained or gusting past the cutoff.
  if (input.windMph >= t.windSustainedMph || (input.gustMph ?? 0) >= t.windGustMph) {
    const gustNote =
      input.gustMph != null && input.gustMph >= t.windGustMph
        ? ` Gusts to ${Math.round(input.gustMph)} mph.`
        : '';
    return {
      title: 'High winds today — hold spraying/blowing, secure equipment',
      body:
        `Sustained winds around ${Math.round(input.windMph)} mph.${gustNote} ` +
        'Hold off on spraying and blowing, and tie down loose gear, debris, and trailer gates.',
      audience: 'all_crew',
    };
  }

  // 4. Frost / cold — air temp or wind chill at/below freezing.
  if (input.tempF <= t.frostTempF || input.feelsLikeF <= t.frostTempF) {
    return {
      title: 'Frost this morning — delayed start, watch for ice',
      body:
        `Around ${Math.round(input.tempF)}°F (feels like ${Math.round(input.feelsLikeF)}°F). ` +
        'Delay the start to let frost lift, and watch for ice on walks, ramps, and steps.',
      audience: 'all_crew',
    };
  }

  // 5. Nothing notable — let the owner schedule as usual.
  return null;
}
