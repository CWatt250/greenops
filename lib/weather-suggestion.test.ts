import { describe, expect, it } from 'vitest';
import {
  suggestAnnouncement,
  WEATHER_SUGGESTION_THRESHOLDS,
  type WeatherSuggestionInput,
} from './weather-suggestion';

// A calm, unremarkable baseline; each case overrides just the fields it tests.
const CLEAR: WeatherSuggestionInput = {
  tempF: 72,
  feelsLikeF: 72,
  windMph: 6,
  gustMph: 10,
  conditionMain: 'Clear',
  isRainingNow: false,
  morningPrecipProb: 0,
  firstDryHourLabel: null,
};

function input(overrides: Partial<WeatherSuggestionInput>): WeatherSuggestionInput {
  return { ...CLEAR, ...overrides };
}

describe('suggestAnnouncement — clear / normal', () => {
  it('returns null when nothing stands out', () => {
    expect(suggestAnnouncement(CLEAR)).toBeNull();
  });

  it('treats just-below-threshold conditions as normal', () => {
    expect(
      suggestAnnouncement(
        input({ feelsLikeF: 94, windMph: 24, gustMph: 29, tempF: 33, morningPrecipProb: 0.49 }),
      ),
    ).toBeNull();
  });
});

describe('suggestAnnouncement — rain', () => {
  it('flags a rain delay when it is raining now, with the dry-hour start time', () => {
    const s = suggestAnnouncement(input({ isRainingNow: true, conditionMain: 'Rain', firstDryHourLabel: '10 AM' }));
    expect(s?.title).toBe('Rain delay — start at 10 AM today');
    expect(s?.body).toMatch(/coming down now/i);
    expect(s?.body).toMatch(/10 AM/);
    expect(s?.audience).toBe('all_crew');
  });

  it('flags a rain delay from a high morning precip probability even when dry now', () => {
    const s = suggestAnnouncement(input({ morningPrecipProb: 0.7, firstDryHourLabel: '11 AM' }));
    expect(s?.title).toBe('Rain delay — start at 11 AM today');
    expect(s?.body).toMatch(/70% chance/);
  });

  it('falls back to a generic delay when no dry hour is known', () => {
    const s = suggestAnnouncement(input({ isRainingNow: true, firstDryHourLabel: null }));
    expect(s?.title).toBe('Rain delay — delayed start today');
    expect(s?.body).toMatch(/until things dry out/i);
  });

  it('fires exactly at the precip threshold', () => {
    expect(suggestAnnouncement(input({ morningPrecipProb: 0.5 }))?.title).toMatch(/^Rain delay/);
  });

  it('takes priority over heat when both apply', () => {
    const s = suggestAnnouncement(input({ isRainingNow: true, feelsLikeF: 100 }));
    expect(s?.title).toMatch(/^Rain delay/);
  });
});

describe('suggestAnnouncement — heat', () => {
  it('flags a heat advisory at/above the feels-like cutoff', () => {
    const s = suggestAnnouncement(input({ tempF: 92, feelsLikeF: 98, conditionMain: 'Clear' }));
    expect(s?.title).toBe('Heat advisory — hydrate, shade breaks, start early');
    expect(s?.body).toMatch(/Feels like 98°F/);
    expect(s?.audience).toBe('all_crew');
  });

  it('fires exactly at 95°F feels-like', () => {
    expect(suggestAnnouncement(input({ feelsLikeF: 95 }))?.title).toMatch(/^Heat advisory/);
  });
});

describe('suggestAnnouncement — wind', () => {
  it('flags high wind on sustained speed alone', () => {
    const s = suggestAnnouncement(input({ windMph: 27, gustMph: 27 }));
    expect(s?.title).toBe('High winds today — hold spraying/blowing, secure equipment');
    expect(s?.body).toMatch(/around 27 mph/);
    expect(s?.body).not.toMatch(/Gusts to/); // gust below the gust cutoff
  });

  it('flags high wind on gusts alone even with calm sustained wind', () => {
    const s = suggestAnnouncement(input({ windMph: 12, gustMph: 33 }));
    expect(s?.title).toMatch(/^High winds/);
    expect(s?.body).toMatch(/Gusts to 33 mph/);
  });

  it('tolerates a null gust', () => {
    const s = suggestAnnouncement(input({ windMph: 26, gustMph: null }));
    expect(s?.title).toMatch(/^High winds/);
    expect(s?.body).not.toMatch(/Gusts to/);
  });
});

describe('suggestAnnouncement — frost / cold', () => {
  it('flags frost when air temp is at/below freezing', () => {
    const s = suggestAnnouncement(input({ tempF: 30, feelsLikeF: 30 }));
    expect(s?.title).toBe('Frost this morning — delayed start, watch for ice');
    expect(s?.body).toMatch(/watch for ice/i);
    expect(s?.audience).toBe('all_crew');
  });

  it('flags frost on wind chill even when air temp is above freezing', () => {
    const s = suggestAnnouncement(input({ tempF: 36, feelsLikeF: 28 }));
    expect(s?.title).toMatch(/^Frost this morning/);
  });
});

describe('suggestAnnouncement — custom thresholds', () => {
  it('honors overridden cutoffs', () => {
    const tropical = { ...WEATHER_SUGGESTION_THRESHOLDS, heatFeelsLikeF: 105 };
    // 98°F feels-like would trip the default but not the tropical override.
    expect(suggestAnnouncement(input({ feelsLikeF: 98 }), tropical)).toBeNull();
    expect(suggestAnnouncement(input({ feelsLikeF: 106 }), tropical)?.title).toMatch(/^Heat advisory/);
  });
});
