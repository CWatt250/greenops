'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Map, { Marker, Source, Layer, NavigationControl, type MapRef } from 'react-map-gl/mapbox';
import { Eye, EyeOff } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/lib/mapbox';
import type { StopStatus } from '@/types';

export interface MapStop {
  id: string;
  lat: number;
  lng: number;
  order: number;
  label: string;
  color: string;
  isSelected?: boolean;
  status?: StopStatus;
  // Group key (e.g. crew_id) used for legend filtering. Null = unassigned.
  groupId?: string | null;
}

export interface MapPolyline {
  id: string; // crew_id or 'single'
  color: string;
  geometry: GeoJSON.LineString;
}

export interface MapLegendItem {
  id: string; // matches MapStop.groupId and MapPolyline.id
  label: string;
  color: string;
  count: number;
}

interface RouteMapProps {
  stops: MapStop[];
  /** Single polyline (legacy / single-crew mode). Ignored if `polylines` set. */
  polyline?: GeoJSON.LineString | null;
  /** Multi-crew mode: one entry per crew. */
  polylines?: MapPolyline[];
  /** Single-crew accent color (used as fallback line/marker tint). */
  crewColor: string;
  selectedStopId?: string | null;
  onStopClick?: (id: string) => void;
  crewLocation?: { lat: number; lng: number } | null;
  /** When provided, render a legend overlay with toggle visibility per group. */
  legend?: MapLegendItem[];
  className?: string;
}

// Tri-Cities, WA — TLC's service area
const FALLBACK_CENTER = { longitude: -119.1734, latitude: 46.2087, zoom: 11 };

export default function RouteMap({
  stops,
  polyline,
  polylines,
  crewColor,
  selectedStopId,
  onStopClick,
  crewLocation,
  legend,
  className,
}: RouteMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const fitBounds = useCallback(() => {
    if (!mapRef.current || stops.length === 0) return;

    const lngs = stops.map((s) => s.lng);
    const lats = stops.map((s) => s.lat);
    if (crewLocation) {
      lngs.push(crewLocation.lng);
      lats.push(crewLocation.lat);
    }

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    if (minLng === maxLng && minLat === maxLat) {
      mapRef.current.flyTo({ center: [minLng, minLat], zoom: 14 });
    } else {
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 80, duration: 800, maxZoom: 16 }
      );
    }
  }, [stops, crewLocation]);

  useEffect(() => {
    const timer = setTimeout(fitBounds, 200);
    return () => clearTimeout(timer);
  }, [fitBounds]);

  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'pk.placeholder') {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-xl ${className ?? ''}`}>
        <div className="text-center p-8">
          <p className="text-sm font-medium text-muted-foreground">Map requires Mapbox token</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in .env.local
          </p>
        </div>
      </div>
    );
  }

  // Visible stops respect the legend hide-toggles.
  const visibleStops = stops.filter((s) => {
    const key = s.groupId ?? null;
    return !(key && hidden.has(key));
  });

  const visiblePolylines: MapPolyline[] = polylines
    ? polylines.filter((p) => !hidden.has(p.id))
    : polyline
      ? [{ id: 'single', color: crewColor, geometry: polyline }]
      : [];

  function toggleGroup(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={FALLBACK_CENTER}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        <NavigationControl position="top-right" />

        {/* Route polylines (one per group) */}
        {visiblePolylines.map((p) => {
          const data: GeoJSON.Feature<GeoJSON.LineString> = {
            type: 'Feature',
            geometry: p.geometry,
            properties: {},
          };
          return (
            <Source key={p.id} id={`route-line-${p.id}`} type="geojson" data={data}>
              <Layer
                id={`route-line-casing-${p.id}`}
                type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
              <Layer
                id={`route-line-fill-${p.id}`}
                type="line"
                paint={{ 'line-color': p.color, 'line-width': 4, 'line-opacity': 0.95 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </Source>
          );
        })}

        {/* Stop markers */}
        {visibleStops.map((stop) => {
          const isSelected = stop.id === selectedStopId;
          const isDone = stop.status === 'complete' || stop.status === 'skipped';
          const isCurrent = stop.status === 'en_route' || stop.status === 'arrived';

          return (
            <Marker
              key={stop.id}
              longitude={stop.lng}
              latitude={stop.lat}
              anchor="center"
              onClick={() => onStopClick?.(stop.id)}
            >
              <div
                className="relative flex items-center justify-center cursor-pointer transition-transform"
                style={{ transform: isSelected ? 'scale(1.3)' : 'scale(1)' }}
              >
                {isCurrent && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-60"
                    style={{ backgroundColor: stop.color, transform: 'scale(1.6)' }}
                  />
                )}
                <div
                  className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-white text-[11px] font-bold shadow-md transition-colors duration-500"
                  style={{
                    backgroundColor: isDone ? '#6B7280' : stop.color,
                    borderColor: isSelected ? '#ffffff' : 'transparent',
                    boxShadow: isSelected ? '0 0 0 3px rgba(255,255,255,0.6)' : undefined,
                  }}
                >
                  {isDone ? '✓' : stop.order}
                </div>
              </div>
            </Marker>
          );
        })}

        {/* Crew live location */}
        {crewLocation && (
          <Marker longitude={crewLocation.lng} latitude={crewLocation.lat} anchor="center">
            <div className="relative flex items-center justify-center">
              <div
                className="absolute h-10 w-10 rounded-full opacity-30 animate-ping"
                style={{ backgroundColor: crewColor }}
              />
              <div
                className="relative h-5 w-5 rounded-full border-2 border-white shadow-lg"
                style={{ backgroundColor: crewColor }}
              />
            </div>
          </Marker>
        )}
      </Map>

      {/* Legend overlay */}
      {legend && legend.length > 0 && (
        <div className="absolute top-3 left-3 rounded-xl bg-background/95 backdrop-blur-sm border shadow-lg p-2 max-w-[220px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pt-0.5 pb-1">
            Crews
          </p>
          <div className="space-y-0.5">
            {legend.map((item) => {
              const isHidden = hidden.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent transition-colors"
                  title={isHidden ? 'Show on map' : 'Hide from map'}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 transition-opacity"
                    style={{
                      backgroundColor: item.color,
                      opacity: isHidden ? 0.3 : 1,
                    }}
                  />
                  <span
                    className={
                      isHidden
                        ? 'flex-1 text-left truncate text-muted-foreground line-through'
                        : 'flex-1 text-left truncate font-medium'
                    }
                  >
                    {item.label}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {item.count}
                  </span>
                  {isHidden ? (
                    <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
