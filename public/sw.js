// TLC Management Platform — service worker.
//
// Strategy:
//   - Static assets (Next /_next/static, /icons, fonts): cache-first
//   - Same-origin GET navigations / pages: stale-while-revalidate so the
//     last-loaded /today still renders when offline
//   - Everything else (Supabase POSTs, ORS proxy, third-party APIs):
//     network-only, fall through to a clear offline error
// We intentionally keep this small and readable instead of pulling in
// next-pwa / Workbox — Next.js 16 + App Router doesn't always play well
// with the bundled solutions.

const CACHE_VERSION = 'tlc-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Routes we explicitly want available offline. Crew workflow lives at /today.
const PRECACHE_URLS = [
  '/',
  '/today',
  '/login',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/tlc-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Some routes may not be reachable at install time (e.g. /today
        // requires auth). That's fine — we'll cache them on first visit.
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(png|jpg|jpeg|svg|webp|woff2?|ttf|css|js|ico)$/.test(url.pathname)
  );
}

function isNavigation(request) {
  return request.mode === 'navigate'
    || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Same-origin only. Cross-origin (Supabase, Mapbox, OWM) is network-only.
  if (url.origin !== self.location.origin) return;

  // Don't intercept Server Actions or RSC payload requests — they need
  // to hit the network so the React tree stays consistent.
  if (request.headers.get('rsc') || url.pathname.startsWith('/api/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isNavigation(request)) {
    event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// Allow the page to ask the SW to update on demand (e.g. after deploy).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
