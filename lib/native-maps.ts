// Platform-aware native maps URL builder.
// iOS  → Apple Maps with turn-by-turn driving directions
// Android → Google Maps Navigation intent
// Anything else → Google Maps web fallback

export interface NativeMapsTarget {
  lat: number | null | undefined;
  lng: number | null | undefined;
  address?: string | null;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; check touch points too.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return (/iPad|iPhone|iPod/.test(ua) || iPadOS)
    // @ts-expect-error — MSStream is a legacy IE/Edge indicator we want to exclude.
    && !window.MSStream;
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function buildDirectionsUrl(target: NativeMapsTarget): string {
  const hasCoords = Number.isFinite(target.lat) && Number.isFinite(target.lng);
  const dest = hasCoords ? `${target.lat},${target.lng}` : encodeURIComponent(target.address ?? '');

  if (isIOS()) {
    // Apple Maps. `dirflg=d` = driving. Falls back to the maps:// scheme so
    // Safari hands off to the native app instead of opening a web page.
    return `maps://?daddr=${dest}&dirflg=d`;
  }
  if (isAndroid()) {
    // google.navigation: triggers Google Maps Navigation when installed.
    return `google.navigation:q=${dest}&mode=d`;
  }
  // Desktop / unsupported mobile → Google Maps web with directions.
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

export function openDirections(target: NativeMapsTarget) {
  if (typeof window === 'undefined') return;
  window.location.href = buildDirectionsUrl(target);
}
