'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  type MapRef,
  Marker,
  NavigationControl,
  Source,
  Layer,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { MAPBOX_TOKEN } from '@/lib/mapbox';
import {
  lineLengthFt, polygonAreaSqFt, suggestLabel, SHAPE_TYPE_COLORS,
  isAreaType, isLineType,
  segmentLengthFt, formatFeetLabel, segmentMidpoint, segmentLabels, shapeSegmentLabels,
  type MeasuredShape, type ShapeType, type LngLat,
} from '@/lib/measurement';
import { Layers, Pentagon, Slash, Trash2, HelpCircle, Undo2, Eraser, Highlighter, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { toast } from 'sonner';
import { ShapeEditPopup } from './shape-edit-popup';
import { CrosshairOverlay } from './crosshair-overlay';
import { DrawingControls } from './drawing-controls';

const TRI_CITIES_FALLBACK = { longitude: -119.1734, latitude: 46.2087, zoom: 11 };

/**
 * requestAnimationFrame throttle — coalesces a flood of map-move / draw.render
 * callbacks into at most one update per frame so live distances stay smooth.
 * Returns a callable with a `.cancel()` to drop a pending frame on cleanup.
 */
function rafThrottle<A extends unknown[]>(fn: (...args: A) => void) {
  let raf = 0;
  let lastArgs: A | null = null;
  const wrapped = (...args: A) => {
    lastArgs = args;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (lastArgs) fn(...lastArgs);
    });
  };
  wrapped.cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastArgs = null;
  };
  return wrapped;
}

interface MeasureMapProps {
  center: { lng: number; lat: number } | null;
  shapes: MeasuredShape[];
  onShapesChange: (shapes: MeasuredShape[]) => void;
  /** Imperatively focus on a shape (called via ref by the right panel). */
  focusShapeRef?: React.MutableRefObject<((id: string) => void) | null>;
  /** Imperatively push React shapes back into the Draw layer (for undo/clear). */
  syncShapesRef?: React.MutableRefObject<(() => void) | null>;
  /** Wires Undo/Clear All into the toolbar; both fire React-side handlers. */
  onUndo?: () => void;
  canUndo?: boolean;
  onClearAll?: () => void;
  /** Called when Area tool is tapped for the first time (mobile toast). */
  onFirstAreaTap?: () => void;
  /** Optional CTA rendered above the drawing tools in the mobile toolbar
   *  (e.g. "Use This Measurement" when returning to the client form). */
  mobileCta?: React.ReactNode;
}

/**
 * Mapbox satellite map + Mapbox GL Draw with a custom React tool panel.
 * Big buttons, labeled controls, and a click-to-edit popup over each shape.
 */
export default function MeasureMap({
  center, shapes, onShapesChange, focusShapeRef, syncShapesRef,
  onUndo, canUndo = false, onClearAll, onFirstAreaTap, mobileCta,
}: MeasureMapProps) {
  const mapRef = useRef<MapRef>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  const shapesRef = useRef<MeasuredShape[]>(shapes);
  const onShapesRef = useRef(onShapesChange);
  const centerRef = useRef(center);
  const crosshairRef = useRef<HTMLDivElement | null>(null);
  // When true, the next handleChange callback is ignored. Used by the
  // imperative sync path (undo / clear all) to avoid event echo.
  const suppressNextChangeRef = useRef(false);

  const [styleId, setStyleId] = useState<'satellite' | 'streets'>('satellite');
  const [drawReady, setDrawReady] = useState(false);
  const [activeMode, setActiveMode] = useState<'simple_select' | 'draw_polygon' | 'draw_line_string'>('simple_select');
  const [helpOpen, setHelpOpen] = useState(false);
  const firstAreaTapRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePoints, setMobilePoints] = useState<[number, number][]>([]);
  const [mobileTool, setMobileTool] = useState<'polygon' | 'line' | null>(null);
  const handleChangeRef = useRef<() => void>(() => {});

  // Freehand "highlighter" mode — touch/tablet only. Gated on the CSS
  // (pointer: coarse) capability (no JS device sniffing) so desktop renders
  // byte-identically. Implemented as a pointer-drag overlay (NOT a Mapbox Draw
  // mode): press-and-drag a finger to paint a live filled zone that follows the
  // pointer, lift to commit it through the same path as the click-to-place
  // tools. `freehandActive` toggles the capture overlay; `freehandPath` holds
  // the in-progress ring (lng/lat) for the live highlight.
  const isCoarse = useMediaQuery('(pointer: coarse)');
  const [freehandActive, setFreehandActive] = useState(false);
  const [freehandPath, setFreehandPath] = useState<LngLat[]>([]);
  // After a finger-lift the painted outline is held as "pending" — it stays on
  // screen until the user taps Complete (commit) or Redo (discard). Avoids
  // relying on a reliable pointerup, which some mobile browsers swallow.
  const [freehandPending, setFreehandPending] = useState(false);
  const freehandPathRef = useRef<LngLat[]>([]);
  const freehandDrawingRef = useRef(false);
  const freehandLastScreenRef = useRef<{ x: number; y: number } | null>(null);

  // ── Live distance state ──────────────────────────────────────────────────
  // Mobile: the geographic coord under the fixed centre crosshair, recomputed
  // as the map pans beneath it. Desktop: the in-progress Draw feature (committed
  // vertices + the cursor-tracking trailing coordinate), read on draw.render.
  const [crosshairCoord, setCrosshairCoord] = useState<LngLat | null>(null);
  const [desktopDraft, setDesktopDraft] = useState<
    { tool: 'polygon' | 'line'; committed: LngLat[]; cursor: LngLat | null } | null
  >(null);
  // Refs so the map event handlers (bound once in handleMapLoad) read live values.
  const isMobileRef = useRef(false);
  const activeModeRef = useRef(activeMode);
  const mobileToolRef = useRef(mobileTool);

  // Selected-shape editor state (popup positioned at the shape's centroid)
  const [editing, setEditing] = useState<{
    shapeId: string;
    position: { x: number; y: number };
  } | null>(null);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { onShapesRef.current = onShapesChange; }, [onShapesChange]);
  useEffect(() => { centerRef.current = center; }, [center]);
  useEffect(() => { isMobileRef.current = isMobile; }, [isMobile]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { mobileToolRef.current = mobileTool; }, [mobileTool]);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const initialViewState = useMemo(
    () => (center
      ? { longitude: center.lng, latitude: center.lat, zoom: 19 }
      : TRI_CITIES_FALLBACK),
    [center]
  );

  // Pan/zoom to a shape's centroid (called by the right panel via ref).
  useEffect(() => {
    if (!focusShapeRef) return;
    focusShapeRef.current = (id: string) => {
      const map = mapRef.current?.getMap();
      const shape = shapesRef.current.find((s) => s.id === id);
      if (!map || !shape) return;
      const c = computeCentroid(shape.geometry);
      if (!c) return;
      map.flyTo({ center: c, zoom: 19, duration: 600 });
    };
    return () => {
      if (focusShapeRef) focusShapeRef.current = null;
    };
  }, [focusShapeRef]);

  // Auto-fly to a freshly-set address. The initialViewState handles the very
  // first mount; this effect picks up every subsequent center change (typed
  // address, suggestion click, Search button, client picker) and animates
  // the camera to zoom 19 — close enough to see individual lawns/driveways
  // but wide enough to keep the property in context.
  useEffect(() => {
    if (!center) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: 19,
      pitch: 0,
      bearing: 0,
      speed: 1.2,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lng, center?.lat]);

  const handleMapLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const MapboxDraw = (await import('@mapbox/mapbox-gl-draw')).default;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {}, // we render our own panel
      defaultMode: 'simple_select',
      styles: [
        // Polygon fill — coloured by user_color, set when type changes.
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': ['coalesce', ['get', 'user_color'], '#F15A24'],
            'fill-opacity': 0.3,
          },
        },
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
        // Line string with thicker stroke (we paint distance label via a marker).
        {
          id: 'gl-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['coalesce', ['get', 'user_color'], '#F15A24'],
            'line-width': 3.5,
          },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addControl(draw as unknown as any);
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
            kind: s.kind,
            color: SHAPE_TYPE_COLORS[s.type],
          },
          geometry: s.geometry,
        })),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (draw as any).set(fc);
    }

    function handleChange() {
      // Suppress event echo when WE just programmatically reset the layer
      // (e.g. undo / clear-all calling syncShapesNow).
      if (suppressNextChangeRef.current) {
        suppressNextChangeRef.current = false;
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fc = (drawRef.current as any).getAll() as GeoJSON.FeatureCollection;
      const next: MeasuredShape[] = [];
      const prev = shapesRef.current;
      let polyN = 0;
      let lineN = 0;
      for (const feature of fc.features) {
        const geomType = feature.geometry.type;
        if (geomType !== 'Polygon' && geomType !== 'LineString') continue;
        const id = String(feature.id ?? '');
        const existing = prev.find((s) => s.id === id);
        const props = (feature.properties ?? {}) as {
          label?: string; shapeType?: ShapeType; kind?: 'polygon' | 'line';
        };
        const kind = geomType === 'Polygon' ? 'polygon' : 'line';
        // Default type based on kind: polygons start as Turf, lines as Edging.
        const fallbackType: ShapeType = kind === 'polygon' ? 'turf' : 'edging';
        const type = (props.shapeType ?? existing?.type ?? fallbackType) as ShapeType;

        if (kind === 'polygon') polyN += 1;
        else lineN += 1;

        // Smart label suggestion for new shapes (no existing label).
        const suggested = existing
          ? null
          : suggestLabel(feature.geometry as GeoJSON.Polygon | GeoJSON.LineString, type, centerRef.current);
        const fallbackLabel = kind === 'polygon' ? `Area ${polyN}` : `Line ${lineN}`;

        next.push({
          id,
          label: existing?.label ?? props.label ?? suggested ?? fallbackLabel,
          kind,
          type,
          area_sqft: kind === 'polygon'
            ? polygonAreaSqFt(feature.geometry as GeoJSON.Polygon)
            : 0,
          length_ft: kind === 'line'
            ? lineLengthFt(feature.geometry as GeoJSON.LineString)
            : 0,
          geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.LineString,
        });
      }
      onShapesRef.current(next);
    }

    function handleSelectionChange(e: { features: GeoJSON.Feature[] }) {
      const map = mapRef.current?.getMap();
      const f = e.features?.[0];
      if (!map || !f || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'LineString')) {
        setEditing(null);
        return;
      }
      const id = String(f.id ?? '');
      const c = computeCentroid(f.geometry as GeoJSON.Polygon | GeoJSON.LineString);
      if (!c) return;
      const pixel = map.project(c);
      setEditing({ shapeId: id, position: { x: pixel.x, y: pixel.y } });
    }

    // Switch back to simple_select after a draw completes so users can pick
    // up another tool intentionally. Without this, they'd stay in
    // draw_polygon and the next click would start another shape.
    function handleModeChange(e: { mode: string }) {
      setActiveMode(e.mode as typeof activeMode);
      // Leaving a draw mode (finish / cancel / escape) tears down the live
      // rubber-band — the completed-shape edge labels take over from here.
      if (e.mode !== 'draw_polygon' && e.mode !== 'draw_line_string') {
        setDesktopDraft(null);
      }
    }
    function handleCreate() {
      setDesktopDraft(null);
      handleChange();
      // After create, Mapbox Draw auto-flips to simple_select.
    }

    // Desktop live distance: on every render while a draw tool is active, read
    // the in-progress feature. Mapbox GL Draw stores it as the committed
    // vertices followed by a trailing coordinate that tracks the cursor
    // (updated on mousemove), so we split it into committed points + cursor.
    function readDesktopDraft() {
      if (isMobileRef.current) return;
      const mode = activeModeRef.current;
      if (mode !== 'draw_polygon' && mode !== 'draw_line_string') return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (drawRef.current as any)?.getAll?.() as GeoJSON.FeatureCollection | undefined;
      if (!all) return;
      const draftFeature = all.features.find((f) =>
        (f.geometry.type === 'LineString' || f.geometry.type === 'Polygon') &&
        !shapesRef.current.some((s) => s.id === String(f.id ?? '')));
      if (!draftFeature) { setDesktopDraft(null); return; }
      const geom = draftFeature.geometry;
      if (geom.type === 'LineString') {
        const coords = geom.coordinates as LngLat[];
        if (coords.length === 0) { setDesktopDraft(null); return; }
        setDesktopDraft({ tool: 'line', committed: coords.slice(0, -1), cursor: coords[coords.length - 1] });
      } else if (geom.type === 'Polygon') {
        // Polygon ring from getAll() is closed: [...committed, cursor, first].
        const ring = (geom.coordinates[0] ?? []) as LngLat[];
        if (ring.length < 2) { setDesktopDraft(null); return; }
        setDesktopDraft({ tool: 'polygon', committed: ring.slice(0, ring.length - 2), cursor: ring[ring.length - 2] });
      }
    }
    const handleRender = rafThrottle(readDesktopDraft);

    handleChangeRef.current = handleChange;

    map.on('draw.create', handleCreate);
    map.on('draw.update', handleChange);
    map.on('draw.delete', () => { setEditing(null); handleChange(); });
    map.on('draw.selectionchange', handleSelectionChange);
    map.on('draw.modechange', handleModeChange);
    map.on('draw.render', handleRender);
  }, []);

  // Re-position the editor popup as the user pans/zooms.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !editing) return;
    function reposition() {
      if (!editing) return;
      const m = mapRef.current?.getMap();
      if (!m) return;
      const shape = shapesRef.current.find((s) => s.id === editing.shapeId);
      if (!shape) return;
      const c = computeCentroid(shape.geometry);
      if (!c) return;
      const px = m.project(c);
      setEditing({ shapeId: editing.shapeId, position: { x: px.x, y: px.y } });
    }
    map.on('move', reposition);
    map.on('zoom', reposition);
    return () => {
      map.off('move', reposition);
      map.off('zoom', reposition);
    };
  }, [editing]);

  // Sync user_color back to draw features whenever the type changes from React.
  useEffect(() => {
    if (!drawReady || !drawRef.current) return;
    for (const s of shapes) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draw = drawRef.current as any;
        draw.setFeatureProperty(s.id, 'label', s.label);
        draw.setFeatureProperty(s.id, 'shapeType', s.type);
        draw.setFeatureProperty(s.id, 'kind', s.kind);
        draw.setFeatureProperty(s.id, 'color', SHAPE_TYPE_COLORS[s.type]);
      } catch { /* feature gone */ }
    }
  }, [shapes, drawReady]);

  // Imperative sync — used by parent's undo / clear-all to push React state
  // back into the Draw layer.
  useEffect(() => {
    if (!syncShapesRef) return;
    syncShapesRef.current = () => {
      const draw = drawRef.current;
      if (!draw) return;
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: shapesRef.current.map((s) => ({
          type: 'Feature',
          id: s.id,
          properties: {
            label: s.label,
            shapeType: s.type,
            kind: s.kind,
            color: SHAPE_TYPE_COLORS[s.type],
          },
          geometry: s.geometry,
        })),
      };
      suppressNextChangeRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (draw as any).set(fc);
      setEditing(null);
    };
    return () => {
      if (syncShapesRef) syncShapesRef.current = null;
    };
  }, [syncShapesRef]);

  // Reset the in-progress freehand stroke (no committed shape touched).
  function clearFreehandDraft() {
    freehandDrawingRef.current = false;
    freehandLastScreenRef.current = null;
    freehandPathRef.current = [];
    setFreehandPath([]);
    setFreehandPending(false);
  }

  // Toggle the freehand highlighter. Entering exits any in-progress crosshair
  // drawing first; leaving discards the in-progress stroke.
  function toggleFreehand() {
    if (!drawRef.current) return;
    if (freehandActive) {
      setFreehandActive(false);
      clearFreehandDraft();
      return;
    }
    setMobileTool(null);
    setMobilePoints([]);
    setEditing(null);
    clearFreehandDraft();
    setFreehandActive(true);
  }

  // Convert a pointer's viewport coords to a map lng/lat via the canvas rect.
  const screenToLngLat = useCallback((clientX: number, clientY: number): LngLat | null => {
    const map = mapRef.current?.getMap();
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const c = map.unproject([clientX - rect.left, clientY - rect.top]);
    return [c.lng, c.lat];
  }, []);

  function onFreehandPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Starting a fresh stroke clears any pending (un-completed) outline.
    setFreehandPending(false);
    freehandDrawingRef.current = true;
    freehandLastScreenRef.current = { x: e.clientX, y: e.clientY };
    const ll = screenToLngLat(e.clientX, e.clientY);
    const start = ll ? [ll] : [];
    freehandPathRef.current = start;
    setFreehandPath(start);
  }

  function onFreehandPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!freehandDrawingRef.current) return;
    // Decimate to ~3px steps so the ring stays light and smooth.
    const last = freehandLastScreenRef.current;
    if (last) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (dx * dx + dy * dy < 9) return;
    }
    freehandLastScreenRef.current = { x: e.clientX, y: e.clientY };
    const ll = screenToLngLat(e.clientX, e.clientY);
    if (!ll) return;
    const next = [...freehandPathRef.current, ll];
    freehandPathRef.current = next;
    setFreehandPath(next);
  }

  function onFreehandPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!freehandDrawingRef.current) return;
    freehandDrawingRef.current = false;
    freehandLastScreenRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const path = freehandPathRef.current;
    const uniq = new Set(path.map((c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`));
    if (uniq.size < 3) {
      // A genuine drag that collapsed to a sliver gets a nudge; a stray tap is
      // ignored silently. Either way, clear and let the user try again.
      if (path.length >= 2) {
        toast('Shape too small — try drawing a larger area', {
          position: 'top-center',
          duration: 2500,
        });
      }
      clearFreehandDraft();
      return;
    }
    // Hold the painted outline on screen awaiting an explicit Complete tap.
    setFreehandPending(true);
  }

  // Commit the pending freehand outline, then exit the tool. Triggered by the
  // Complete button (not the finger-lift) so completion is deterministic.
  function completeFreehand() {
    if (commitFreehand(freehandPathRef.current)) {
      clearFreehandDraft();
      setFreehandActive(false);
    }
  }

  // Discard the pending outline but stay in highlight mode to redraw.
  function redoFreehand() {
    clearFreehandDraft();
  }

  // Close the freehand ring and commit it as a polygon. Builds the shape and
  // appends it to React state directly (not via a Draw-layer re-read) so the
  // measurement is picked up immediately, mirrors the Draw layer for editing,
  // and opens the shape's detail just like the click-to-place tools do.
  // Returns true if a shape was committed.
  function commitFreehand(path: LngLat[]): boolean {
    const draw = drawRef.current;
    const uniq = new Set(path.map((c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`));
    if (!draw || uniq.size < 3) {
      if (path.length >= 2) {
        toast('Shape too small — try drawing a larger area', {
          position: 'top-center',
          duration: 2500,
        });
      }
      return false;
    }

    const id = String(Date.now());
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[...path, path[0]]] };
    const type: ShapeType = 'turf';
    const polyCount = shapesRef.current.filter((s) => s.kind === 'polygon').length;
    const newShape: MeasuredShape = {
      id,
      label: suggestLabel(geometry, type, centerRef.current) ?? `Area ${polyCount + 1}`,
      kind: 'polygon',
      type,
      area_sqft: polygonAreaSqFt(geometry),
      length_ft: 0,
      geometry,
    };

    // Mirror the shape into the Draw layer so it renders + stays selectable, and
    // append it to React state so the panel/sheet pick it up right away.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (draw as any).add({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id, properties: {}, geometry }],
    } as GeoJSON.FeatureCollection);
    onShapesRef.current([...shapesRef.current, newShape]);

    // Open the measurement detail for the new zone (parity with click-to-place,
    // which auto-selects the shape it just drew).
    const map = mapRef.current?.getMap();
    const c = computeCentroid(geometry);
    if (map && c) {
      const px = map.project(c);
      setEditing({ shapeId: id, position: { x: px.x, y: px.y } });
    }
    return true;
  }

  // Disable map pan / pinch-zoom / rotate while freehand is active so the draw
  // gesture isn't fought by the camera, and re-enable on exit. (The upstream
  // mode also toggles dragPan; this covers the multi-touch handlers too.)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any;
    const toggle = (on: boolean) => {
      for (const h of [m.dragPan, m.touchZoomRotate, m.doubleClickZoom, m.dragRotate]) {
        if (!h) continue;
        if (on) h.enable();
        else h.disable();
      }
    };
    toggle(!freehandActive);
    return () => toggle(true);
  }, [freehandActive, drawReady]);

  function setMode(mode: 'simple_select' | 'draw_polygon' | 'draw_line_string') {
    if (!drawRef.current) return;

    // Switching to Area / Line / select exits an active freehand draw cleanly,
    // discarding the in-progress highlight.
    if (freehandActive) {
      setFreehandActive(false);
      clearFreehandDraft();
    }

    if (isMobile) {
      if (mode === 'draw_polygon') {
        const next = mobileTool === 'polygon' ? null : 'polygon';
        setMobileTool(next);
        setMobilePoints([]);
        if (next && !firstAreaTapRef.current) {
          firstAreaTapRef.current = true;
          onFirstAreaTap?.();
        }
        return;
      }
      if (mode === 'draw_line_string') {
        const next = mobileTool === 'line' ? null : 'line';
        setMobileTool(next);
        setMobilePoints([]);
        return;
      }
      // simple_select — cancel any in-progress drawing
      setMobileTool(null);
      setMobilePoints([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (drawRef.current as any).changeMode('simple_select');
      setActiveMode('simple_select');
      return;
    }

    // Desktop path — use Draw's native modes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (drawRef.current as any).changeMode(mode);
    setActiveMode(mode);
    if (mode === 'draw_polygon' && !firstAreaTapRef.current) {
      firstAreaTapRef.current = true;
      onFirstAreaTap?.();
      try {
        if (!window.localStorage.getItem('mobile_measure_seen_intro')) {
          window.localStorage.setItem('mobile_measure_seen_intro', '1');
          toast('Tap each corner of the property, then double-tap to close the shape.', { duration: 4000, position: 'top-center' });
        }
      } catch { /* localStorage not available */ }
    }
  }

  // Unproject the crosshair's actual on-screen position to map coords.
  // Using map.getCenter() returns the geographic center of the map canvas,
  // which drifts from the visual crosshair by the height of any header or
  // address banner above the map — so points landed below where the user
  // was aiming. unproject() with the crosshair's bounding rect lands the
  // point exactly under the visual aim point.
  const crosshairLngLat = useCallback((): LngLat | null => {
    const map = mapRef.current?.getMap();
    if (!map) return null;
    const canvas = map.getCanvas();
    const mapRect = canvas.getBoundingClientRect();
    const ch = crosshairRef.current;
    if (ch) {
      const chRect = ch.getBoundingClientRect();
      const screenX = chRect.left + chRect.width / 2 - mapRect.left;
      const screenY = chRect.top + chRect.height / 2 - mapRect.top;
      const coord = map.unproject([screenX, screenY]);
      return [coord.lng, coord.lat];
    }
    // Fallback: unproject the canvas center.
    const coord = map.unproject([mapRect.width / 2, mapRect.height / 2]);
    return [coord.lng, coord.lat];
  }, []);

  function addPointAtCenter() {
    const coord = crosshairLngLat();
    if (!coord) return;
    setMobilePoints((prev) => [...prev, coord]);
  }

  // Mobile live distance: while a draw tool is active, track the geographic
  // coord under the fixed centre crosshair as the map pans beneath it. The
  // rubber-band segment runs from the last placed point to this coord. When no
  // tool is active the stale value is never read — `live` and the preview both
  // gate on `mobileTool` / a freshly-cleared `mobilePoints`.
  useEffect(() => {
    if (!isMobile || !mobileTool) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const update = rafThrottle(() => setCrosshairCoord(crosshairLngLat()));
    update(); // seed (async via rAF) so the label shows before the first pan
    map.on('move', update);
    return () => {
      map.off('move', update);
      update.cancel();
    };
  }, [isMobile, mobileTool, crosshairLngLat]);

  function closeShape() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw = drawRef.current as any;
    if (!draw || mobilePoints.length < 2) return;
    let geometry: GeoJSON.Geometry;
    if (mobileTool === 'polygon' && mobilePoints.length >= 3) {
      geometry = {
        type: 'Polygon',
        coordinates: [[...mobilePoints, mobilePoints[0]]],
      };
    } else {
      geometry = {
        type: 'LineString',
        coordinates: mobilePoints,
      };
    }
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: String(Date.now()),
        properties: {},
        geometry,
      }],
    };
    draw.add(fc);
    handleChangeRef.current();
    setMobilePoints([]);
    setMobileTool(null);
  }

  function undoLastPoint() {
    setMobilePoints((prev) => prev.slice(0, -1));
  }

  function cancelDrawing() {
    setMobilePoints([]);
    setMobileTool(null);
  }

  function deleteSelected() {
    if (!drawRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw = drawRef.current as any;
    const ids = draw.getSelectedIds();
    if (ids.length === 0) return;
    draw.delete(ids);
    setEditing(null);
    // draw.delete fires draw.delete event → onShapesChange already updates state.
  }

  function deleteOne(id: string) {
    if (!drawRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw = drawRef.current as any;
    draw.delete([id]);
    setEditing(null);
  }

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

  // Static distance labels for every completed shape — one per edge. Lines get
  // a label on each segment; polygons get one on each edge (including the
  // closing edge). The area total still lives in the measurements sheet.
  const completedSegmentLabels = shapes.flatMap((s) =>
    shapeSegmentLabels(s.geometry).map((seg, i) => ({
      key: `${s.id}-${i}`,
      lng: seg.mid[0],
      lat: seg.mid[1],
      label: formatFeetLabel(seg.ft),
    })));

  // Unified in-progress drawing state. Both input paths feed the SAME live
  // renderer: mobile supplies the crosshair coord as the pointer; desktop
  // supplies the cursor read from the Draw feature.
  const live: { tool: 'polygon' | 'line'; committed: LngLat[]; cursor: LngLat | null } | null =
    isMobile
      ? (mobileTool ? { tool: mobileTool, committed: mobilePoints as LngLat[], cursor: crosshairCoord } : null)
      : desktopDraft;

  // Labels for segments already placed in the in-progress shape.
  const liveCommittedLabels = live && live.committed.length >= 2
    ? segmentLabels(live.committed, false).map((seg, i) => ({
        key: `live-${i}`,
        lng: seg.mid[0],
        lat: seg.mid[1],
        label: formatFeetLabel(seg.ft),
      }))
    : [];

  // The live rubber-band segment: last placed point → current pointer.
  const lastPlaced = live && live.committed.length >= 1
    ? live.committed[live.committed.length - 1]
    : null;
  const liveSeg = lastPlaced && live?.cursor
    ? (() => {
        const mid = segmentMidpoint(lastPlaced, live.cursor!);
        return { lng: mid[0], lat: mid[1], label: formatFeetLabel(segmentLengthFt(lastPlaced, live.cursor!)) };
      })()
    : null;

  // Polygon order badges — sequential numbers at centroids.
  const orderBadges = shapes.map((s, i) => {
    const c = computeCentroid(s.geometry);
    return c ? {
      id: s.id, lng: c[0], lat: c[1], n: i + 1, color: SHAPE_TYPE_COLORS[s.type],
    } : null;
  }).filter((x): x is { id: string; lng: number; lat: number; n: number; color: string } => x !== null);

  const noShapes = shapes.length === 0;
  const editingShape = editing
    ? shapes.find((s) => s.id === editing.shapeId) ?? null
    : null;

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
        {!isMobile && <NavigationControl position="bottom-right" />}
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
        {/* Sequential order badges */}
        {orderBadges.map((b) => (
          <Marker key={`n-${b.id}`} longitude={b.lng} latitude={b.lat} anchor="center">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shadow"
              style={{ backgroundColor: b.color, border: '2px solid #fff' }}
            >
              {b.n}
            </span>
          </Marker>
        ))}
        {/* Completed-shape edge distance labels (lines + polygons) */}
        {completedSegmentLabels.map((l) => (
          <Marker key={`d-${l.key}`} longitude={l.lng} latitude={l.lat} anchor="center">
            <DistanceLabel>{l.label}</DistanceLabel>
          </Marker>
        ))}

        {/* In-progress: static labels for segments already placed */}
        {liveCommittedLabels.map((l) => (
          <Marker key={l.key} longitude={l.lng} latitude={l.lat} anchor="center">
            <DistanceLabel>{l.label}</DistanceLabel>
          </Marker>
        ))}

        {/* In-progress: live rubber-band distance (last point → pointer) */}
        {liveSeg && (
          <Marker key="live-seg" longitude={liveSeg.lng} latitude={liveSeg.lat} anchor="center">
            <DistanceLabel live>{liveSeg.label}</DistanceLabel>
          </Marker>
        )}

        {/* Mobile in-progress drawing preview — committed polyline extended to
            the crosshair so the last segment reads as a live rubber band.
            (Desktop draws its own in-progress line via Mapbox GL Draw.) */}
        {isMobile && (mobilePoints.length + (crosshairCoord ? 1 : 0)) >= 2 && (
          <Source
            id="mobile-preview"
            type="geojson"
            data={({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: crosshairCoord ? [...mobilePoints, crosshairCoord] : mobilePoints,
              },
            }) as GeoJSON.Feature}
          >
            <Layer
              id="mobile-preview-line"
              type="line"
              paint={{
                'line-color': '#F15A24',
                'line-width': 2.5,
                'line-dasharray': [3, 2],
              }}
            />
          </Source>
        )}
        {mobilePoints.map((pt, i) => (
          <Marker key={`mp-${i}`} longitude={pt[0]} latitude={pt[1]} anchor="center">
            <div
              className="w-3 h-3 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: '#F15A24' }}
            />
          </Marker>
        ))}

        {/* Freehand highlighter — live filled zone following the finger. Once
            three points exist it closes into a translucent orange fill with a
            2px border, like a highlighter pen; before that it's just a stroke. */}
        {freehandActive && freehandPath.length >= 2 && (
          <Source
            id="freehand-preview"
            type="geojson"
            data={({
              type: 'Feature',
              properties: {},
              geometry: freehandPath.length >= 3
                ? { type: 'Polygon', coordinates: [[...freehandPath, freehandPath[0]]] }
                : { type: 'LineString', coordinates: freehandPath },
            }) as GeoJSON.Feature}
          >
            {freehandPath.length >= 3 && (
              <Layer
                id="freehand-preview-fill"
                type="fill"
                paint={{ 'fill-color': '#F15A24', 'fill-opacity': 0.3 }}
              />
            )}
            <Layer
              id="freehand-preview-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#F15A24', 'line-width': 2 }}
            />
          </Source>
        )}
      </Map>

      {/* Freehand capture overlay — sits above the map canvas but below the
          floating toolbars (z-30 / z-10) so the Highlight toggle stays tappable.
          Captures pointer drags to paint a zone; touch-action:none stops the
          browser from hijacking the gesture as a scroll/zoom. */}
      {freehandActive && (
        <div
          className="absolute inset-0 z-[5]"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onFreehandPointerDown}
          onPointerMove={onFreehandPointerMove}
          onPointerUp={onFreehandPointerUp}
          onPointerCancel={onFreehandPointerUp}
        />
      )}

      {/* Style toggle (top-left) */}
      <div className="absolute top-3 left-3 inline-flex rounded-lg border bg-background/95 backdrop-blur-sm shadow p-0.5 z-10">
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

      {/* ── DESKTOP TOOLBAR (hidden on mobile) ── */}
      <div className="hidden md:flex absolute top-3 right-3 flex-col gap-1.5 z-10">
        {/* Shape count — live spatial awareness */}
        <div
          className="inline-flex items-center gap-1 rounded-full border bg-background/95 backdrop-blur-sm shadow px-2.5 py-1 text-[10px] font-mono tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {shapes.length} shape{shapes.length === 1 ? '' : 's'} drawn
        </div>

        <div className="rounded-xl border bg-background/95 backdrop-blur-sm shadow-md p-1.5 flex flex-col gap-1">
          <ToolButton
            label="Area"
            sublabel="Polygon"
            active={activeMode === 'draw_polygon'}
            onClick={() => setMode('draw_polygon')}
            icon={<Pentagon className="h-5 w-5" />}
            title="Polygon — measure area (click to add a vertex, double-click to close)"
          />
          <ToolButton
            label="Line"
            sublabel="Distance"
            active={activeMode === 'draw_line_string'}
            onClick={() => setMode('draw_line_string')}
            icon={<Slash className="h-5 w-5" />}
            title="Line — measure distance (click to add a vertex, double-click to finish)"
          />
          {/* Freehand highlighter — touch/tablet only (pointer: coarse). */}
          {isCoarse && (
            <ToolButton
              label="Hi-lite"
              sublabel="Freehand zone"
              active={freehandActive}
              onClick={toggleFreehand}
              icon={<Highlighter className="h-5 w-5" />}
              title="Highlight — drag your finger to trace a zone"
            />
          )}
          <div className="h-px bg-border my-0.5" aria-hidden />
          <ToolButton
            label="Undo"
            sublabel=""
            active={false}
            disabled={!canUndo}
            onClick={() => onUndo?.()}
            icon={<Undo2 className="h-5 w-5" />}
            title="Undo last change (⌘Z / Ctrl+Z)"
          />
          <ToolButton
            label="Delete"
            sublabel=""
            active={false}
            onClick={deleteSelected}
            icon={<Trash2 className="h-5 w-5" />}
            title="Delete selected shape"
            destructive
          />
          <ToolButton
            label="Clear"
            sublabel="Wipe all"
            active={false}
            disabled={shapes.length === 0}
            onClick={() => onClearAll?.()}
            icon={<Eraser className="h-5 w-5" />}
            title="Clear all shapes — removes every measurement"
            destructive
          />
        </div>
        {/* Freehand hint — coarse-pointer tablets that render the wide toolbar. */}
        {isCoarse && freehandActive && !freehandPending && (
          <div
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-white shadow-md px-3 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: 'var(--orange)' }}
          >
            <Highlighter className="h-3.5 w-3.5" />
            Drag to paint a zone · map locked
          </div>
        )}
        {/* Freehand Complete / Redo for tablets — explicit finish, not a lift. */}
        {isCoarse && freehandActive && freehandPending && (
          <div className="inline-flex items-center gap-1.5 rounded-xl border bg-background/95 backdrop-blur-sm shadow-md p-1">
            <button
              type="button"
              onClick={completeFreehand}
              className="h-9 px-3 rounded-lg font-bold text-xs text-white flex items-center justify-center gap-1 shadow"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              <Check className="h-3.5 w-3.5" />
              Complete
            </button>
            <button
              type="button"
              onClick={redoFreehand}
              className="h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Redo
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setHelpOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border bg-background/95 backdrop-blur-sm shadow px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="Tool descriptions"
          title="What does each tool do?"
        >
          <HelpCircle className="h-3 w-3" />
          help
        </button>
        {helpOpen && (
          <div className="rounded-xl border bg-popover shadow-xl p-3 w-[220px] text-xs space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
              Tools
            </p>
            <p>
              <strong>Area</strong> — click around the perimeter of a lawn / hardscape area. Double-click to close.
            </p>
            <p>
              <strong>Line</strong> — measure distances like driveway length, fence line, or edging.
            </p>
            <p>
              <strong>Delete</strong> — first select a shape on the map, then click Delete.
            </p>
            <p className="text-muted-foreground">
              Tip: click any drawn shape to rename it or change its type.
            </p>
          </div>
        )}
      </div>

      {/* ── MOBILE TOOLBAR (hidden on desktop) ── */}
      {/* Bottom = bottom-nav (3.5rem + safe-area) + sheet peek (~5rem)
          + 0.5rem breathing room. Z-index sits below the bottom sheet (z-40)
          and below the bottom nav (z-50). */}
      <div
        className="md:hidden fixed z-30 flex flex-col items-center gap-2 pointer-events-none"
        style={{
          bottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))',
          left: 'env(safe-area-inset-left, 0px)',
          right: 'env(safe-area-inset-right, 0px)',
        }}
      >
        {/* Shape count — hidden while drawing to keep map area maximal */}
        {shapes.length > 0 && !mobileTool && (
          <div className="pointer-events-auto rounded-full border bg-background/95 backdrop-blur-sm shadow px-2.5 py-1 text-[10px] font-mono tabular-nums text-muted-foreground">
            {shapes.length} shape{shapes.length === 1 ? '' : 's'} drawn
          </div>
        )}

        {/* CTA (e.g. "Use This Measurement") injected by parent — also hidden
            while drawing to maximise map area */}
        {mobileCta && !mobileTool && (
          <div className="pointer-events-auto w-full px-3">
            {mobileCta}
          </div>
        )}

        {/* Mobile crosshair drawing controls — compact single-row bar */}
        {isMobile && mobileTool && (
          <DrawingControls
            pointCount={mobilePoints.length}
            tool={mobileTool}
            onAddPoint={addPointAtCenter}
            onCloseShape={closeShape}
            onUndoPoint={undoLastPoint}
            onCancel={cancelDrawing}
          />
        )}

        {/* Freehand hint — visible cue that highlighter draw mode is on
            (before a stroke is painted). */}
        {isCoarse && freehandActive && !freehandPending && (
          <div
            className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border-2 border-white shadow-md px-3 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: 'var(--orange)' }}
          >
            <Highlighter className="h-3.5 w-3.5" />
            Drag to paint a zone · map locked
          </div>
        )}

        {/* Freehand Complete / Redo — shown once an outline is painted and held
            pending, so finishing is an explicit tap, not a finicky finger-lift. */}
        {isCoarse && freehandActive && freehandPending && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border bg-background/95 backdrop-blur-sm shadow-lg p-1.5">
            <button
              type="button"
              onClick={completeFreehand}
              className="h-11 px-5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 shadow"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              <Check className="h-4 w-4" />
              Complete zone
            </button>
            <button
              type="button"
              onClick={redoFreehand}
              className="h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground border"
            >
              <RotateCcw className="h-4 w-4" />
              Redo
            </button>
          </div>
        )}

        {/* Area/Line/Undo/Delete toolbar — hidden while drawing or while a
            freehand outline is pending (the Complete bar handles that). */}
        {!mobileTool && !freehandPending && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg px-2.5 py-1.5">
            <CompactToolButton
              label="Area"
              active={isMobile ? mobileTool === 'polygon' : activeMode === 'draw_polygon'}
              onClick={() => setMode('draw_polygon')}
            />
            <CompactToolButton
              label="Line"
              active={isMobile ? mobileTool === 'line' : activeMode === 'draw_line_string'}
              onClick={() => setMode('draw_line_string')}
            />
            {/* Freehand highlighter — touch/tablet only (pointer: coarse). */}
            {isCoarse && (
              <CompactToolButton
                label="Highlight"
                title="Highlight — drag your finger to trace a zone"
                active={freehandActive}
                onClick={toggleFreehand}
                icon={<Highlighter className="h-4 w-4" />}
              />
            )}
            <div className="w-px h-6 bg-border" aria-hidden />
            <CompactToolButton
              label="Undo"
              disabled={!canUndo}
              onClick={() => onUndo?.()}
              destructive
            />
            <CompactToolButton
              label="Delete"
              onClick={deleteSelected}
              destructive
            />
          </div>
        )}

        {/* Help button */}
        <div className="pointer-events-auto absolute bottom-0 right-3 translate-y-1/2">
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border bg-background/95 backdrop-blur-sm shadow text-muted-foreground hover:text-foreground"
            aria-label="Tool descriptions"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {helpOpen && (
            <div className="absolute bottom-full right-0 mb-2 rounded-xl border bg-popover shadow-xl p-3 w-[220px] text-xs space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                Tools
              </p>
              <p>
                <strong>Area</strong> — tap corners of the property, then double-tap to close the shape.
              </p>
              <p>
                <strong>Line</strong> — measure distances like driveway or fence length.
              </p>
              <p>
                <strong>Delete</strong> — first select a shape on the map, then tap Delete.
              </p>
              <p className="text-muted-foreground">
                Tip: tap any drawn shape to rename it or change its type.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Floating shape editor */}
      {editingShape && editing && (
        <ShapeEditPopup
          shape={editingShape}
          position={editing.position}
          onChange={(patch) => {
            const next = shapesRef.current.map((s) => (
              s.id === editingShape.id ? { ...s, ...patch } : s
            ));
            onShapesRef.current(next);
          }}
          onDelete={() => deleteOne(editingShape.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Crosshair overlay — mobile draw mode only */}
      <CrosshairOverlay
        ref={crosshairRef}
        visible={isMobile && mobileTool !== null}
      />
    </div>
  );
}

/**
 * Distance pill rendered over satellite imagery. Static placed-segment labels
 * use a light pill with a dark-bordered outline for legibility; the `live`
 * variant (the in-progress rubber-band reading) uses a solid orange fill so the
 * updating measurement stands out from the frozen ones.
 */
function DistanceLabel({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  if (live) {
    return (
      <div
        className="rounded-full border-2 border-white shadow-md px-2 py-0.5 text-[11px] font-mono font-bold tabular-nums text-white whitespace-nowrap"
        style={{ backgroundColor: '#F15A24' }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className="rounded-full bg-background/95 backdrop-blur-sm border shadow px-2 py-0.5 text-[10px] font-mono tabular-nums whitespace-nowrap"
      style={{ color: 'var(--orange-deep)', borderColor: 'var(--orange)' }}
    >
      {children}
    </div>
  );
}

function CompactToolButton({
  label, active, onClick, disabled = false, destructive = false, icon, title,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title ?? label}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 min-w-10 px-1.5 h-10 rounded-lg transition-all text-[11px] font-semibold',
        active
          ? 'bg-[var(--orange)] text-white shadow'
          : destructive
            ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolButton({
  label, sublabel, active, onClick, icon, title, destructive = false, disabled = false,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'group flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-lg transition-all',
        'border',
        active
          ? 'bg-[var(--orange)] text-white border-white ring-2 ring-[var(--orange)] shadow'
          : destructive
            ? 'bg-background text-destructive border-transparent hover:bg-destructive/10'
            : 'bg-background text-foreground border-transparent hover:border-foreground/20 hover:bg-accent/40',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
    >
      {icon}
      <span className="text-[8px] font-bold uppercase tracking-wider leading-none">
        {label}
      </span>
      {sublabel && (
        <span className="sr-only">{sublabel}</span>
      )}
    </button>
  );
}

function computeCentroid(geom: GeoJSON.Polygon | GeoJSON.LineString): [number, number] | null {
  try {
    if (geom.type === 'Polygon') {
      const ring = geom.coordinates[0] as [number, number][];
      if (!ring || ring.length === 0) return null;
      let x = 0, y = 0;
      for (const [lng, lat] of ring) { x += lng; y += lat; }
      return [x / ring.length, y / ring.length];
    }
    const line = geom.coordinates as [number, number][];
    if (!line || line.length === 0) return null;
    const mid = line[Math.floor(line.length / 2)];
    return [mid[0], mid[1]];
  } catch {
    return null;
  }
}

// Suppress unused-import warning when nothing references these helpers.
void isAreaType;
void isLineType;
