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

/**
 * A normalized, *active* weather alert as surfaced by One Call 3.0's `alerts[]`
 * (event, end time, tags). The I/O layer (`lib/weather.ts`) is responsible for
 * dropping expired/not-yet-started alerts and for formatting `endLabel` into a
 * local time string — that keeps the time math (and its timezone pitfalls) out
 * of this pure module so the classification + copy logic stays deterministic
 * and trivially unit-testable.
 */
export interface WeatherAlert {
  /** Official alert name, e.g. "Wind Advisory", "Excessive Heat Warning". */
  event: string;
  /**
   * Local-time label for when the alert ends, e.g. "11 PM" or "Tue 6 AM", or
   * null when no end time is known. Drives the "until …" copy.
   */
  endLabel: string | null;
  /** Alert tags from the provider, e.g. ["Wind"]; used to aid classification. */
  tags?: string[];
  /**
   * NWS severity for the alert, when the source provides it. A more severe
   * alert wins over a less severe one regardless of category (a Severe Red
   * Flag Warning should beat a Moderate Heat Advisory); ties fall back to the
   * category priority order.
   */
  severity?: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
}

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
  /**
   * Active, official weather alerts for the location (from One Call 3.0's
   * `alerts[]`), or undefined when none were available or the alerts fetch
   * failed. An active, crew-relevant alert takes priority over the raw
   * threshold rules below; anything else falls through to v1 unchanged.
   */
  alerts?: WeatherAlert[];
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

/**
 * Crew-relevant alert categories, most schedule-disruptive first. The order is
 * the tie-breaker when several active alerts apply at once.
 */
type AlertCategory = 'severe' | 'heat' | 'winter' | 'wind' | 'fire' | 'air';

const ALERT_PRIORITY: AlertCategory[] = ['severe', 'heat', 'winter', 'wind', 'fire', 'air'];

/**
 * Operational guidance per alert category. `titleSuffix` completes the headline
 * ("{event} until {end} — {suffix}"); `body` expands it into crew copy.
 */
const ALERT_GUIDANCE: Record<
  AlertCategory,
  { titleSuffix: string; body: (event: string, untilClause: string) => string }
> = {
  severe: {
    titleSuffix: 'rain delay',
    body: (event, until) =>
      `A ${event} is in effect${until}. Hold the start — expect downpours, lightning, ` +
      'and wet, slick ground. Resume once it clears.',
  },
  heat: {
    titleSuffix: 'hydrate, shade breaks, start early',
    body: (event, until) =>
      `A ${event} is in effect${until}. Keep water close, take shade breaks, and ` +
      'front-load the heavy work before the afternoon peak.',
  },
  winter: {
    titleSuffix: 'delayed start, watch for ice',
    body: (event, until) =>
      `A ${event} is in effect${until}. Delay the start until things thaw, and watch ` +
      'for ice on walks, ramps, and steps.',
  },
  wind: {
    titleSuffix: 'hold spraying/blowing, secure equipment',
    body: (event, until) =>
      `A ${event} is in effect${until}. Hold off on spraying and blowing — drift and ` +
      'flying debris are the risk — and tie down loose gear, bags, and trailer gates.',
  },
  fire: {
    titleSuffix: 'no burns, watch sparks, gusty winds',
    body: (event, until) =>
      `A ${event} is in effect${until}. Critical fire weather — no burn piles or debris ` +
      'burning, keep hot mufflers and trimmers off dry grass, and expect gusty, erratic ' +
      'winds. If thunder starts, get crews out of open fields.',
  },
  air: {
    titleSuffix: 'masks, limit exertion',
    body: (event, until) =>
      `A ${event} is in effect${until}. Wear masks and limit heavy exertion outdoors ` +
      'until air quality improves.',
  },
};

/**
 * Classify an official alert into a crew guidance category, or null when it is
 * not relevant to a landscaping crew (marine/coastal/surf, or anything we don't
 * map). Matching is keyword-based against the event name plus any tags, and is
 * intentionally tolerant — provider wording varies.
 *
 * Order matters: crew-irrelevant alerts are filtered first, then the most
 * specific categories. "Wind Chill" must classify as winter, not wind, so the
 * winter check runs before the wind check.
 */
function classifyAlert(event: string, tags: string[]): AlertCategory | null {
  const hay = `${event} ${tags.join(' ')}`.toLowerCase();

  // Crew-irrelevant — on the water or the shore. Ignore outright.
  if (/marine|coastal|rip current|small craft|beach|surf|tsunami|seiche|lakeshore/.test(hay)) {
    return null;
  }
  if (/thunderstorm|tornado|flash flood|flood|heavy rain/.test(hay)) return 'severe';
  if (/heat/.test(hay)) return 'heat';
  if (/winter|ice|icy|freez|frost|snow|blizzard|cold|chill|sleet/.test(hay)) return 'winter';
  if (/red flag|fire/.test(hay)) return 'fire';
  if (/wind|gale|dust/.test(hay)) return 'wind';
  if (/air quality|smoke/.test(hay)) return 'air';
  return null;
}

/** Lower rank = more urgent. Alerts without a known severity sort last. */
const SEVERITY_RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };

function severityRank(severity: WeatherAlert['severity']): number {
  return severity != null && severity in SEVERITY_RANK ? SEVERITY_RANK[severity] : 4;
}

/**
 * Build a suggestion from the most urgent active, crew-relevant alert — highest
 * provider severity first, category priority as the tie-breaker — or null when
 * there are no alerts or none are relevant (→ caller falls back to the
 * threshold rules).
 */
function suggestFromAlerts(alerts: WeatherAlert[] | undefined): WeatherSuggestion | null {
  if (!alerts || alerts.length === 0) return null;

  let best: { category: AlertCategory; alert: WeatherAlert } | null = null;
  for (const alert of alerts) {
    const category = classifyAlert(alert.event, alert.tags ?? []);
    if (!category) continue;
    if (!best) {
      best = { category, alert };
      continue;
    }
    const sev = severityRank(alert.severity);
    const bestSev = severityRank(best.alert.severity);
    if (
      sev < bestSev ||
      (sev === bestSev &&
        ALERT_PRIORITY.indexOf(category) < ALERT_PRIORITY.indexOf(best.category))
    ) {
      best = { category, alert };
    }
  }
  if (!best) return null;

  const guidance = ALERT_GUIDANCE[best.category];
  const untilClause = best.alert.endLabel ? ` until ${best.alert.endLabel}` : '';
  return {
    title: `${best.alert.event}${untilClause} — ${guidance.titleSuffix}`,
    body: guidance.body(best.alert.event, untilClause),
    audience: 'all_crew',
  };
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
 * An active, crew-relevant official alert (NWS, via One Call's `alerts[]`) is
 * authoritative and wins over everything — it reflects conditions the raw
 * thresholds can miss (e.g. a Wind Advisory issued below our wind cutoff). When
 * no such alert applies, the v1 threshold rules run unchanged, in priority order
 * (most schedule-disruptive first):
 *   0. Active official alert (if any, crew-relevant)
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

  // 0. Official alert — authoritative; beats the raw thresholds below.
  const alertSuggestion = suggestFromAlerts(input.alerts);
  if (alertSuggestion) return alertSuggestion;

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
