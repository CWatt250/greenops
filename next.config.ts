import type { NextConfig } from "next";

// Report-only CSP first: it logs violations in the browser console without
// blocking anything. Promote to `Content-Security-Policy` once a week of real
// use shows no reports. Third parties: Supabase (REST + Realtime + Storage),
// Mapbox (styles, tiles, telemetry), OpenWeather (icons), Google Fonts (the
// fonts are self-hosted by next/font, but the loader is allowed defensively).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com https://openweathermap.org",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://api.openweathermap.org",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  // The TLC logo is served locally from /public/tlc-logo.png, so no remote
  // image hosts need to be allow-listed.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
