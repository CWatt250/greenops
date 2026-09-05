import type { NextConfig } from "next";

// Enforced CSP. Violations are reported to /api/csp-report, which files them
// in client_errors (Settings → Message & error log) so a blocked resource in
// production is visible, not silent. Third parties: Supabase (REST + Realtime
// + Storage), Mapbox (styles, tiles, telemetry), OpenWeather (icons), Google
// Fonts (self-hosted by next/font, allowed defensively). Images allow any
// https host because company logos (companies.logo_url) live on the
// customer's own website.
// Supabase origin comes from the env so local/CI stacks (127.0.0.1:54321) and
// production (*.supabase.co) both pass; realtime uses the ws(s) form.
const supabaseHttp = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return "https://*.supabase.co"; }
})();
const supabaseWs = supabaseHttp.replace(/^http/, "ws");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' data: blob: ${supabaseHttp} ${supabaseWs} https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://api.openweathermap.org`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // The TLC logo is served locally from /public/tlc-logo.png, so no remote
  // image hosts need to be allow-listed.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
