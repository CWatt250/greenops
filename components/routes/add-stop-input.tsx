'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Plus, Search, X } from 'lucide-react';
import { searchPlaces, type PlaceSuggestion } from '@/lib/mapbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AddStopInputProps {
  onAdd: (place: PlaceSuggestion) => void;
  crewColor: string;
}

export function AddStopInput({ onAdd, crewColor }: AddStopInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete
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

  // Close on outside click
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

  function reset() {
    setQuery('');
    setSuggestions([]);
    setHighlight(0);
  }

  function handleSelect(place: PlaceSuggestion) {
    onAdd(place);
    reset();
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && suggestions[highlight]) {
      e.preventDefault();
      handleSelect(suggestions[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      reset();
    }
  }

  if (!open) {
    return (
      <div className="px-3 pb-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-1.5 border-dashed"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Stop
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-3 pb-3 relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search address (e.g. 1234 W 4th Ave Kennewick)"
          className="w-full h-9 pl-8 pr-9 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          aria-label="Close"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Suggestions */}
      {(query.trim().length >= 3 || searching) && (
        <div className="mt-1 rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
          {searching && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}
          {!searching && suggestions.length === 0 && query.trim().length >= 3 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No matching addresses.
            </div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => handleSelect(s)}
              className={cn(
                'flex items-start gap-2 w-full text-left px-3 py-2 text-xs border-b last:border-b-0 transition-colors',
                i === highlight ? 'bg-accent' : 'hover:bg-accent/60'
              )}
            >
              <span
                className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full shrink-0"
                style={{ backgroundColor: crewColor }}
              >
                <MapPin className="h-2.5 w-2.5 text-white" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium truncate">{s.shortName}</span>
                <span className="block text-muted-foreground truncate">{s.context}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
