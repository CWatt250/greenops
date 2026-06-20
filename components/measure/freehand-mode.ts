/* eslint-disable @typescript-eslint/no-explicit-any */
import FreehandMode from 'mapbox-gl-draw-freehand-mode';

/**
 * Touch-first "highlighter" draw mode for the measure tool.
 *
 * Built on the upstream `mapbox-gl-draw-freehand-mode`: press-and-drag traces a
 * polygon that follows the finger, lift auto-closes it, and the ring is
 * simplified with a zoom-correlated tolerance (so detail stays stable across
 * zoom levels). The upstream mode also disables `dragPan` for the duration of
 * the drag so the map doesn't fight the gesture.
 *
 * This wrapper adds ONE behavior on top: when a very fast swipe (or an
 * accidental tap-drag) collapses to fewer than three unique points after
 * simplification, the resulting "polygon" isn't a real area — we silently
 * discard it and fire {@link FREEHAND_TOO_SMALL_EVENT} on the map so the UI can
 * surface a brief "draw a larger area" toast.
 *
 * It is registered as a SEPARATE named mode (`draw_freehand`); the stock
 * `draw_polygon` click-to-place Area tool is left completely untouched.
 */

/** Fired on the map when a freehand drag is too small to be a valid polygon. */
export const FREEHAND_TOO_SMALL_EVENT = 'draw.freehand.toosmall';

/** Minimum distinct vertices a simplified ring needs to count as an area. */
const MIN_UNIQUE_POINTS = 3;

function uniquePointCount(ring: unknown): number {
  if (!Array.isArray(ring)) return 0;
  const seen = new Set<string>();
  for (const c of ring) {
    if (Array.isArray(c) && c.length >= 2) seen.add(`${c[0]},${c[1]}`);
  }
  return seen.size;
}

const DrawFreehand: any = { ...(FreehandMode as any) };

DrawFreehand.onMouseUp = function (this: any, state: any) {
  // A press with no drag never produced a path. Leave the empty placeholder
  // feature for onStop (inherited from draw_polygon) to clean up.
  if (!state.dragMoving) return;

  this.simplify(state.polygon);

  const ring = state.polygon.getCoordinates?.()?.[0];
  if (uniquePointCount(ring) < MIN_UNIQUE_POINTS) {
    this.deleteFeature([state.polygon.id], { silent: true });
    this.map.fire(FREEHAND_TOO_SMALL_EVENT, {});
    this.changeMode('simple_select');
    return;
  }

  this.fireUpdate();
  this.changeMode('simple_select', { featureIds: [state.polygon.id] });
};

DrawFreehand.onTouchEnd = function (this: any, state: any) {
  this.onMouseUp(state);
};

export default DrawFreehand;
