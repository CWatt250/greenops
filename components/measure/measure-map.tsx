'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { type MapRef, NavigationControl, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { MAPBOX_TOKEN } from '@/lib/mapbox';
import {
  polygonAreaSqFt,
  SHAPE_TYPE_COLORS,
  type MeasuredShape,
  type ShapeType,
} from '@/lib/measurement';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRI_CITIES_FALLBACK = { longitude: -119.1734, latitude: 46.2087, zoom: 11 };

interface MeasureMapProps {
  center: { lng: number; lat: number } | null;
  shapes: MeasuredShape[];
  onShapesChange: (shapes: MeasuredShape[]) => void;
}

/**
 * Mapbox satellite map + Mapbox GL Draw for polygons.
 * Each drawn polygon is converted to a MeasuredShape with computed area.
 */
export default function MeasureMap({ center, shapes, onShapesChange }: MeasureMapProps) {
  const mapRef = useRef<MapRef>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  const shapesRef = useRef<MeasuredShape[]>(shapes);
  const onShapesRef = useRef(onShapesChange);
  const [styleId, setStyleId] = useState<'satellite' | 'streets'>('satellite');
  const [drawReady, setDrawReady] = useState(false);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    onShapesRef.current = onShapesChange;
  }, [onShapesChange]);

  const initialViewState = useMemo(
    () => (center
      ? { longitude: center.lng, latitude: center.lat, zoom: 19 }
      : TRI_CITIES_FALLBACK),
    [center]
  );

  const handleMapLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // mapbox-gl-draw is a vanilla mapbox-gl plugin — dynamic-import so it
    // doesn't pull into the SSR bundle.
    const MapboxDraw = (await import('@mapbox/mapbox-gl-draw')).default;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, line_string: true, trash: true },
      defaultMode: 'simple_select',
      // Custom styles: orange while drawing, type-coloured when committed.
      styles: [
        // Polygon fill — coloured by feature.properties.color (set on update).
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': ['coalesce', ['get', 'user_color'], '#F15A24'],
            'fill-opacity': 0.3,
          },
        },
        // Polygon outline.
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['coalesce', ['get', 'user_color'], '#F15A24'],
            'line-width': 2.5,
          },
        },
        // Polygon vertices while editing.
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['==', 'active', 'true']],
          paint: {
            'circle-radius': 5,
            'circle-color': '#fff',
            'circle-stroke-color': '#F15A24',
            'circle-stroke-width': 2,
          },
        },
        // Line string (perimeter measure).
        {
          id: 'gl-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#F15A24', 'line-width': 3 },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addControl(draw as unknown as any, 'top-right');
    drawRef.current = draw;
    setDrawReady(true);

    // Hydrate any saved shapes
    if (shapesRef.current.length > 0) {
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: shapesRef.current.map((s) => ({
          type: 'Feature',
          id: s.id,
          properties: {
            label: s.label,
            shapeType: s.type,
            color: SHAPE_TYPE_COLORS[s.type],
          },
          geometry: s.geometry,
        })),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (draw as any).set(fc);
    }

    function handleChange() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fc = (drawRef.current as any).getAll() as GeoJSON.FeatureCollection;
      const next: MeasuredShape[] = [];
      for (const feature of fc.features) {
        if (feature.geometry.type !== 'Polygon') continue;
        const id = String(feature.id ?? '');
        const existing = shapesRef.current.find((s) => s.id === id);
        const props = (feature.properties ?? {}) as { label?: string; shapeType?: ShapeType };
        next.push({
          id,
          label: props.label ?? existing?.label ?? `Area ${next.length + 1}`,
          type: (props.shapeType ?? existing?.type ?? 'turf') as ShapeType,
          area_sqft: polygonAreaSqFt(feature.geometry as GeoJSON.Polygon),
          geometry: feature.geometry as GeoJSON.Polygon,
        });
      }
      onShapesRef.current(next);
    }

    map.on('draw.create', handleChange);
    map.on('draw.update', handleChange);
    map.on('draw.delete', handleChange);
  }, []);

  // Keep Draw's style/colour properties in sync when shapes' types change in the right panel.
  useEffect(() => {
    if (!drawReady || !drawRef.current) return;
    for (const s of shapes) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draw = drawRef.current as any;
        draw.setFeatureProperty(s.id, 'label', s.label);
        draw.setFeatureProperty(s.id, 'shapeType', s.type);
        draw.setFeatureProperty(s.id, 'color', SHAPE_TYPE_COLORS[s.type]);
      } catch {
        // Feature might have been removed elsewhere; ignore.
      }
    }
  }, [shapes, drawReady]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center bg-muted/30 h-full rounded-xl">
        <div className="text-center p-8">
          <p className="text-sm font-medium text-muted-foreground">Map requires Mapbox token</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in .env.local
          </p>
        </div>
      </div>
    );
  }

  const styleUrl = styleId === 'satellite'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onLoad={handleMapLoad}
      >
        <NavigationControl position="bottom-right" />
        {center && (
          <Marker longitude={center.lng} latitude={center.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-[var(--orange)] text-white text-[10px] font-bold px-2 py-0.5 shadow">
                Property
              </div>
              <div className="w-0.5 h-3 bg-[var(--orange)]" />
            </div>
          </Marker>
        )}
      </Map>

      {/* Style toggle */}
      <div className="absolute top-3 left-3 inline-flex rounded-lg border bg-background/95 backdrop-blur-sm shadow p-0.5">
        {(['satellite', 'streets'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStyleId(s)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors flex items-center gap-1',
              styleId === s
                ? 'bg-[var(--orange)] text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Layers className="h-3 w-3" />
            {s}
          </button>
        ))}
      </div>

      {/* Drawing instructions */}
      {shapes.length === 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/95 backdrop-blur-sm border shadow px-3 py-1.5 text-[11px] text-muted-foreground">
          Use the polygon tool (top-right) to outline the lawn. Double-click to close.
        </div>
      )}
    </div>
  );
}
