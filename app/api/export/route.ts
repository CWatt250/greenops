import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildZip, type ZipEntry } from '@/lib/zip';
import { csvCell } from '@/lib/qbo-export';

/**
 * "Download all my data" (owner only). One ZIP of CSVs — every company-scoped
 * table plus the child tables reached through parents — and a photo manifest
 * with 7-day signed URLs. This is the exit clause in the Terms made real.
 */
export const maxDuration = 120;

const COMPANY_TABLES = [
  'clients', 'jobs', 'job_series', 'job_templates', 'job_photos', 'job_cost_entries', 'routes',
  'estimates', 'invoices', 'payments', 'billing_schedules', 'services', 'service_presets',
  'crews', 'clock_events', 'daily_summaries', 'service_requests', 'complaints', 'messages',
  'chemical_products', 'chemical_applications', 'property_measurements', 'form_templates',
  'form_submissions', 'note_templates', 'activity_log', 'profiles', 'portal_users', 'outbound_messages',
];
// child table → [parent table, foreign key on child]
const CHILD_TABLES: Array<[string, string, string]> = [
  ['job_line_items', 'jobs', 'job_id'],
  ['job_services', 'jobs', 'job_id'],
  ['route_stops', 'routes', 'route_id'],
  ['estimate_line_items', 'estimates', 'estimate_id'],
  ['invoice_line_items', 'invoices', 'invoice_id'],
  ['crew_members', 'crews', 'crew_id'],
  ['crew_skills', 'crews', 'crew_id'],
  ['applicator_licenses', 'profiles', 'profile_id'],
  ['portal_notifications', 'portal_users', 'portal_user_id'],
];
const OMIT = new Set(['temp_password']);

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h) => !OMIT.has(h));
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvCell(typeof r[h] === 'object' && r[h] !== null ? JSON.stringify(r[h]) : r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

async function fetchAll(admin: SupabaseClient, table: string, filter: (q: ReturnType<SupabaseClient['from']>['select'] extends (...a: never[]) => infer R ? R : never) => unknown): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin.from(table).select('*').range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!me?.company_id || me.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const companyId = me.company_id;
  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};
  const idsByTable = new Map<string, string[]>();

  try {
    const { data: company } = await admin.from('companies').select('*').eq('id', companyId).single();
    entries.push({ name: 'company.csv', data: toCsv(company ? [company as Record<string, unknown>] : []) });

    for (const table of COMPANY_TABLES) {
      const rows = await fetchAll(admin, table, (q) => q.eq('company_id', companyId));
      counts[table] = rows.length;
      idsByTable.set(table, rows.map((r) => String(r.id)));
      entries.push({ name: `${table}.csv`, data: toCsv(rows) });
    }
    for (const [table, parent, fk] of CHILD_TABLES) {
      const parentIds = idsByTable.get(parent) ?? [];
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < parentIds.length; i += 80) {
        const chunk = parentIds.slice(i, i + 80);
        rows.push(...(await fetchAll(admin, table, (q) => q.in(fk, chunk))));
      }
      counts[table] = rows.length;
      entries.push({ name: `${table}.csv`, data: toCsv(rows) });
    }

    // Photo manifest with signed URLs (7 days) so the files can be pulled.
    const { data: photos } = await admin.from('job_photos').select('id, job_id, storage_path, caption, created_at').eq('company_id', companyId).limit(5000);
    const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean);
    const urlByPath = new Map<string, string>();
    for (let i = 0; i < paths.length; i += 100) {
      const { data: signed } = await admin.storage.from('job-photos').createSignedUrls(paths.slice(i, i + 100), 7 * 24 * 60 * 60);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    entries.push({ name: 'photos_manifest.csv', data: toCsv((photos ?? []).map((p) => ({ ...p, download_url: urlByPath.get(p.storage_path) ?? '' }))) });

    entries.unshift({
      name: 'README.txt',
      data: [
        `Data export for ${(company as { name?: string } | null)?.name ?? 'your company'} — ${new Date().toISOString()}`,
        '',
        'One CSV per table. Column names match the database. JSON columns are serialized as JSON text.',
        'photos_manifest.csv links to each photo with a download URL valid for 7 days from export.',
        '',
        'Row counts:',
        ...Object.entries(counts).map(([t, n]) => `  ${t}: ${n}`),
        '',
        'Questions: support@watt-systems.com',
      ].join('\n'),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const zip = buildZip(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Blob([zip as unknown as BlobPart]), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="data-export-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
