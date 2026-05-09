'use client';

import { useEffect, useState } from 'react';

interface Props {
  firstName: string;
  jobsToday: number;
  crewsActive: number;
  city?: string | null;
  weather?: { temp: number; unitSymbol: '°F' | '°C'; condition: string } | null;
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatEyebrow(d: Date) {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

/**
 * Time-aware hero block at the top of /dashboard. Re-evaluates the greeting
 * once on mount so a noon refresh picks up "Good afternoon" without needing
 * a server roundtrip. (The page itself is force-dynamic, so reloads are
 * always fresh anyway — this is just for sessions left open.)
 */
export function HeroGreeting({ firstName, jobsToday, crewsActive, city, weather }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const greeting = now ? greetingForHour(now.getHours()) : 'Welcome';
  const eyebrow = now ? formatEyebrow(now) : '\u00a0';

  const weatherSegment = weather && city
    ? ` · ${weather.temp}${weather.unitSymbol} & ${weather.condition.toLowerCase()} in ${city}`
    : weather
      ? ` · ${weather.temp}${weather.unitSymbol} & ${weather.condition.toLowerCase()}`
      : '';

  return (
    <div>
      <p className="page-eyebrow">{eyebrow}</p>
      <h1 className="page-title" style={{ fontSize: 38 }}>
        {greeting}, {firstName}
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        {jobsToday} job{jobsToday === 1 ? '' : 's'} scheduled across {crewsActive} crew{crewsActive === 1 ? '' : 's'}
        {weatherSegment}
      </p>
    </div>
  );
}
