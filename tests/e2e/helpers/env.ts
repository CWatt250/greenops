import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads `.env.test` into both `process.env` (without clobbering vars already
 * set — e.g. CI secrets) and a returned record. Kept dependency-free so the
 * Playwright config can call it without pulling in `dotenv`.
 */
export function loadEnvTest(): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), '.env.test'), 'utf8');
  } catch {
    // In CI the values come from real environment variables / secrets instead.
    return collectFromProcess(out);
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '');
    out[key] = val;
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return collectFromProcess(out);
}

// Ensure the returned record reflects the final process.env (real env wins).
function collectFromProcess(out: Record<string, string>): Record<string, string> {
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_MAPBOX_TOKEN',
    'ORS_API_KEY',
    'E2E_OWNER_EMAIL',
    'E2E_OWNER_PASSWORD',
    'E2E_CREW_EMAIL',
    'E2E_CREW_PASSWORD',
    'E2E_COMPANY_ID',
  ]) {
    if (process.env[key] !== undefined) out[key] = process.env[key] as string;
  }
  return out;
}

/** True when a usable Mapbox token is configured (not the placeholder). */
export function hasRealMapboxToken(): boolean {
  const t = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  return t.startsWith('pk.') && t !== 'pk.placeholder';
}
