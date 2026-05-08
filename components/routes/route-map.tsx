'use client';

import { useEffect, useRef, useCallback } from 'react';
import Map, { Marker, Source, Layer, NavigationControl, type MapRef } from 'react-map-gl/mapbox';
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
}

interface RouteMapProps {
  stops: MapStop[];
  polyline: GeoJSON.LineString | null;
  crewColor: string;
  selectedStopId?: string | null;
  onStopClick?: (id: string) => void;
  crewLocation?: { lat: number; lng: number } | null;
  className?: string;
}

// Tri-Cities, WA — TLC's service area
const FALLBACK_CENTER = { longitude: -119.1734, latitude: 46.2087, zoom: 11 };

export default function RouteMap({
  stops,
  polyline,
  crewColor,
  selectedStopId,
  onStopClick,
  crewLocation,
  className,
}: RouteMapProps) {
  const mapRef = useRef<MapRef>(null);

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

  const polylineGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null = polyline
    ? { type: 'Feature', geometry: polyline, properties: {} }
    : null;

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={FALLBACK_CENTER}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      <NavigationControl position="top-right" />

      {/* Route polyline */}
      {polylineGeoJson && (
        <Source id="route-line" type="geojson" data={polylineGeoJson}>
          <Layer
            id="route-line-casing"
            type="line"
            paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="route-line-fill"
            type="line"
            paint={{ 'line-color': crewColor, 'line-width': 3.5, 'line-opacity': 0.9 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Stop markers */}
      {stops.map((stop) => {
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
                className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-white text-[11px] font-bold shadow-md"
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
  );
}
