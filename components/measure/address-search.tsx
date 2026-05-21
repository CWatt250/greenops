'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import {
  searchPlaces, geocodeAddressDetailed, type PlaceSuggestion,
} from '@/lib/mapbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AddressSearchProps {
  /** Called when the user picks a suggestion or hits Enter on a typed address. */
  onAddress: (place: PlaceSuggestion) => void;
  /** When true, focuses the input on first mount. */
  autoFocus?: boolean;
  initialValue?: string;
  placeholder?: string;
}

export function AddressSearch({
  onAddress,
  autoFocus = true,
  initialValue = '',
  placeholder = 'Type any address — no customer record needed',
}: AddressSearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced typeahead.
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const results = await searchPlaces(query);
      if (cancelled) return;
      setSuggestions(results);
      setHighlight(0);
      setSearching(false);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Close suggestions on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function pick(place: PlaceSuggestion) {
    setQuery(place.placeName);
    setSuggestions([]);
    setOpen(false);
    // Belt-and-suspenders against iOS Safari's "stuck zoom" after selecting a
    // suggestion. The 16px input rule should prevent the zoom from firing in
    // the first place, but on autocomplete tap iOS sometimes still scales —
    // blurring the input and briefly clamping maximum-scale forces Safari to
    // snap back to 1x. The viewport meta is restored so the user can still
    // pinch-zoom the satellite map afterwards.
    inputRef.current?.blur();
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const original = viewport.getAttribute('content') ?? '';
      if (original && !original.includes('maximum-scale=1')) {
        viewport.setAttribute(
          'content',
          `${original}, maximum-scale=1.0`,
        );
        window.setTimeout(() => {
          viewport.setAttribute('content', original);
        }, 120);
      }
    }
    onAddress(place);
  }

  async function submit() {
    if (suggestions[highlight]) {
      pick(suggestions[highlight]);
      return;
    }
    if (query.trim().length < 3) return;
    setSubmitting(true);
    const result = await geocodeAddressDetailed(query);
    setSubmitting(false);
    if (!result) return;
    pick(result);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <div className="flex gap-2 items-stretch w-full min-w-0">
        <div className="relative flex-1 min-w-0">
          <MapPin
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: 'var(--orange)' }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            // text-base (16px) on mobile so iOS Safari doesn't auto-zoom.
            // Above md, drop to text-sm to match the rest of the desktop UI.
            className="w-full h-11 pl-10 pr-3 text-base md:text-sm font-medium rounded-lg border-2 bg-background focus:outline-none focus:ring-2 focus:ring-[var(--orange)] focus:border-[var(--orange)] transition-colors"
            aria-label="Address to measure"
          />
          {(searching || submitting) && (
            <Loader2
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={query.trim().length < 3 || submitting}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          className="gap-1.5 h-11 shrink-0"
        >
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>

      {/* Suggestions dropdown */}
      {open && (suggestions.length > 0 || searching) && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-xl ring-1 ring-foreground/10 max-h-72 overflow-y-auto">
          {searching && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(s)}
              className={cn(
                'flex items-start gap-2 w-full text-left px-3 py-2.5 text-xs border-b last:border-b-0 transition-colors',
                i === highlight ? 'bg-accent' : 'hover:bg-accent/60'
              )}
            >
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" style={{ color: 'var(--orange)' }} />
              <span className="min-w-0">
                <span className="block font-semibold truncate">{s.shortName}</span>
                <span className="block text-muted-foreground truncate">{s.context}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
