'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { searchPlaces, geocodeAddressDetailed, type PlaceSuggestion } from '@/lib/mapbox';
import { getDashboardWeather, type DashboardWeatherDay } from '@/lib/weather';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Loader2, MapPin, Search, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/types';

interface Props {
  company: Company;
}

const DAY_OPTIONS = [3, 5, 7] as const;

export function WeatherSettingsForm({ company }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [label, setLabel] = useState(company.weather_location_label ?? '');
  const [lat, setLat] = useState<number | null>(
    typeof company.weather_latitude === 'number' ? Number(company.weather_latitude) : null,
  );
  const [lng, setLng] = useState<number | null>(
    typeof company.weather_longitude === 'number' ? Number(company.weather_longitude) : null,
  );
  const [days, setDays] = useState<3 | 5 | 7>((company.weather_forecast_days ?? 3) as 3 | 5 | 7);
  const [units, setUnits] = useState<'imperial' | 'metric'>(
    (company.weather_units ?? 'imperial') as 'imperial' | 'metric',
  );
  const [showOnDashboard, setShowOnDashboard] = useState(
    company.weather_show_on_dashboard !== false,
  );

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<DashboardWeatherDay[] | null>(null);

  const hasCustomLocation = !!label || (typeof lat === 'number' && typeof lng === 'number');
  const fallbackLabel = [company.city, company.state].filter(Boolean).join(', ');

  // Debounced address search
  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const results = await searchPlaces(query);
      if (!cancelled) {
        setSuggestions(results);
        setHighlight(0);
        setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open]);

  // Outside-click closes the suggestions panel
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function pickSuggestion(s: PlaceSuggestion) {
    const cleanLabel = s.context || s.placeName;
    setLabel(cleanLabel);
    setLat(s.lat);
    setLng(s.lng);
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setPreview(null);
  }

  async function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlight]) {
        pickSuggestion(suggestions[highlight]);
        return;
      }
      // Geocode whatever's in the box if no autocomplete fired
      if (query.trim().length > 0) {
        const result = await geocodeAddressDetailed(query.trim());
        if (result) pickSuggestion(result);
        else toast.error('Could not find that location.');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function clearLocation() {
    setLabel('');
    setLat(null);
    setLng(null);
    setPreview(null);
  }

  async function runPreview() {
    setPreviewing(true);
    try {
      const result = typeof lat === 'number' && typeof lng === 'number'
        ? await getDashboardWeather(
            { lat, lng },
            { days, units, locationLabel: label || fallbackLabel },
          )
        : company.city
          ? await getDashboardWeather(
              { city: company.city, state: company.state ?? undefined },
              { days, units, locationLabel: label || fallbackLabel },
            )
          : null;
      if (result) {
        setPreview(result.forecast);
        if (!result.ok) {
          toast.warning('Weather API key missing or rejected — showing sample data.');
        }
      } else {
        toast.error('No location set and no company city to fall back on.');
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        weather_location_label: label || null,
        weather_latitude: lat,
        weather_longitude: lng,
        weather_forecast_days: days,
        weather_units: units,
        weather_show_on_dashboard: showOnDashboard,
      })
      .eq('id', company.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Weather preferences saved.');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Show-on-dashboard toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium">Show on dashboard</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hides the Weather Watch card entirely when off.
          </p>
        </div>
        <Switch
          checked={showOnDashboard}
          onCheckedChange={setShowOnDashboard}
          aria-label="Show weather on dashboard"
        />
      </div>

      {/* Location autocomplete */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Location</Label>
        {hasCustomLocation ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm flex-1 truncate">{label || `${lat?.toFixed(3)}, ${lng?.toFixed(3)}`}</span>
            <button
              type="button"
              onClick={clearLocation}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear custom location"
              title="Use company address instead"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {fallbackLabel
              ? <>Using company address: <strong>{fallbackLabel}</strong></>
              : 'No company city set — using sample data.'}
          </p>
        )}

        <div ref={containerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleEnter}
              placeholder={hasCustomLocation ? 'Change location…' : 'e.g., Seattle, WA'}
              className="w-full h-9 pl-8 pr-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {open && (query.trim().length >= 3 || searching) && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {searching && suggestions.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching…
                </div>
              )}
              {!searching && suggestions.length === 0 && query.trim().length >= 3 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No matching locations.
                </div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pickSuggestion(s)}
                  className={cn(
                    'flex items-start gap-2 w-full text-left px-3 py-2 text-xs border-b last:border-b-0 transition-colors',
                    i === highlight ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{s.shortName || s.placeName}</span>
                    <span className="block text-muted-foreground truncate">{s.context}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Forecast length */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Forecast length</Label>
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/30">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDays(d); setPreview(null); }}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                days === d
                  ? 'text-white shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              style={days === d ? { backgroundColor: 'var(--orange)' } : undefined}
              aria-pressed={days === d}
            >
              {d} days
            </button>
          ))}
        </div>
        {days === 7 && (
          <p className="text-[11px] text-muted-foreground">
            7-day requires OpenWeatherMap&apos;s OneCall API. Falls back to 5 days if unavailable.
          </p>
        )}
      </div>

      {/* Units toggle */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Temperature units</Label>
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/30">
          {(['imperial', 'metric'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => { setUnits(u); setPreview(null); }}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                units === u
                  ? 'text-white shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              style={units === u ? { backgroundColor: 'var(--orange)' } : undefined}
              aria-pressed={units === u}
            >
              {u === 'imperial' ? '°F' : '°C'}
            </button>
          ))}
        </div>
      </div>

      {/* Preview pane */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Preview</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runPreview}
            disabled={previewing}
            className="gap-1.5"
          >
            {previewing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Eye className="h-3.5 w-3.5" />}
            Preview
          </Button>
        </div>
        {preview ? (
          <div className="rounded-lg border bg-muted/30 p-3 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {preview.map((d) => (
                <div
                  key={d.date}
                  className="rounded-md border bg-background p-2 text-center min-w-[72px]"
                  style={{
                    borderColor: d.badWeather ? 'var(--orange)' : undefined,
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {d.dayLabel}
                  </p>
                  <p
                    className="text-base leading-none tabular-nums mt-1"
                    style={{ fontFamily: 'var(--font-display), Impact, sans-serif' }}
                  >
                    {d.high}{d.unitSymbol}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">
                    {d.condition}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Click Preview to see how the widget will look with these settings.
          </p>
        )}
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="w-full text-white"
        style={{ backgroundColor: 'var(--orange)' }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save weather preferences
      </Button>
    </div>
  );
}
